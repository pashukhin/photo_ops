#!/usr/bin/env bash
#
# One-shot live-stack validation for the async media path.
#
# s008's hardest lesson: a green `make gate` AND a clean whole-branch review
# missed THREE real bugs (worker RabbitMQ boot-race crash, the _lat/_lon
# proto3-optional leak, the smoke's own assertion) that ONLY the live
# `make smoke-media` caught — mocks share the code's assumptions, the real
# transport does not. This script makes that high-value validation cheap and
# reliable: build only the services the smoke needs, bring them up clean, wait
# for readiness, migrate, run the media smoke, then tear down.
#
# Two s008 frictions are designed out here:
#   - Build output goes to a LOG FILE, never `... | tail` (which ate the s008
#     build failure). On failure we print the tail AND the path.
#   - A disk-headroom check up front (s008 hit ENOSPC mid-build).
#
# This script OWNS the dev compose project: it resets volumes at start and tear
# down. Do NOT run it alongside `make dev` with data you care about.
#
# Tunable via env:
#   SMOKE_STACK_MIN_FREE_GB   minimum free GB before building       (default 8)
#   SMOKE_STACK_READY_TIMEOUT seconds to wait for gateway readiness  (default 120)
#   SMOKE_STACK_LOG_DIR       where build/up/migrate logs land       (default .smoke-stack)
#   SMOKE_STACK_KEEP_UP=1      leave the stack running for debugging  (default tear down)
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE="docker compose -f infra/docker/docker-compose.yml --env-file .env"

# Services the media smoke actually exercises: the API gateway plus the full
# async media path (identity for signup, photo for upload, the worker, and the
# postgres/minio/rabbitmq infra they depend on). Deliberately excludes web and
# the not-yet-built cluster/publication/usage/connector services.
INFRA_SERVICES="postgres minio rabbitmq"
APP_SERVICES="identity-service photo-service api-gateway media-worker"

LOG_DIR="${SMOKE_STACK_LOG_DIR:-.smoke-stack}"
BUILD_LOG="$LOG_DIR/build.log"
UP_LOG="$LOG_DIR/up.log"
MIGRATE_LOG="$LOG_DIR/migrate.log"
MIN_FREE_GB="${SMOKE_STACK_MIN_FREE_GB:-8}"
READY_TIMEOUT="${SMOKE_STACK_READY_TIMEOUT:-120}"
KEEP_UP="${SMOKE_STACK_KEEP_UP:-0}"
API_BASE_URL="${API_BASE_URL:-http://localhost:3001}"
HEALTH_URL="${SMOKE_STACK_HEALTH_URL:-$API_BASE_URL/health}"
VENV_PY="apps/media-worker/.venv/bin/python"

mkdir -p "$LOG_DIR"

say()  { printf 'smoke-stack: %s\n' "$*"; }
die()  { printf 'smoke-stack: %s\n' "$*" >&2; exit 1; }

teardown() {
  local rc=$?
  if [ "$KEEP_UP" = "1" ]; then
    say "SMOKE_STACK_KEEP_UP=1 — leaving stack running (tear down: $COMPOSE down -v)"
    return $rc
  fi
  say "tearing down…"
  $COMPOSE down -v >/dev/null 2>&1 || true
  return $rc
}
trap teardown EXIT

# --- 1. disk headroom (s008 friction: ENOSPC mid-build) ----------------------
avail_gb=$(( $(df -Pk . | awk 'NR==2 {print $4}') / 1024 / 1024 ))
[ "$avail_gb" -ge "$MIN_FREE_GB" ] \
  || die "only ${avail_gb}GB free (< ${MIN_FREE_GB}GB needed). Free space or lower SMOKE_STACK_MIN_FREE_GB."
say "${avail_gb}GB free — ok"

# --- 2. ensure the media-worker venv exists (the smoke renders a test JPEG) ---
if [ ! -x "$VENV_PY" ]; then
  say "media-worker venv missing — creating…"
  ( cd apps/media-worker && python3 -m venv .venv && .venv/bin/pip install -q -e ".[dev]" )
fi

# --- 3. clean slate, then build only what the smoke needs --------------------
say "resetting any existing stack…"
$COMPOSE down -v >/dev/null 2>&1 || true

say "building [$APP_SERVICES] -> $BUILD_LOG (full output to file, not piped)"
if ! $COMPOSE build $APP_SERVICES >"$BUILD_LOG" 2>&1; then
  say "build FAILED — see $BUILD_LOG (last 20 lines below):"
  tail -20 "$BUILD_LOG" >&2
  exit 1
fi
say "build ok"

# --- 4. infra up to healthy (they have docker healthchecks) ------------------
say "starting infra [$INFRA_SERVICES] and waiting for health…"
if ! $COMPOSE up -d --wait $INFRA_SERVICES >"$UP_LOG" 2>&1; then
  say "infra failed to become healthy — see $UP_LOG:"; tail -20 "$UP_LOG" >&2; exit 1
fi

# --- 5. migrate BEFORE the app services start, so they connect to a fully
#        migrated schema. (Postgres' init mount creates the databases on first
#        boot; migrate adds the tables.) Ordering matters: bringing app services
#        up first races their pools/gRPC channels against schema creation. ------
say "applying migrations -> $MIGRATE_LOG"
if ! make migrate >"$MIGRATE_LOG" 2>&1; then
  say "migrate FAILED — see $MIGRATE_LOG:"; tail -20 "$MIGRATE_LOG" >&2; exit 1
fi
say "migrations ok"

# --- 6. app services up ------------------------------------------------------
say "starting app services [$APP_SERVICES]…"
if ! $COMPOSE up -d $APP_SERVICES >>"$UP_LOG" 2>&1; then
  say "app services failed to start — see $UP_LOG:"; tail -20 "$UP_LOG" >&2; exit 1
fi

# --- 7. FUNCTIONAL readiness gate --------------------------------------------
# The gateway's /health is static — it returns ok as soon as the HTTP server is
# up, BEFORE its gRPC channels to identity/photo are connected (a true readiness
# check is photo_ops-de6's job). Polling /health alone let the smoke fire into
# that warm-up window and hit a transient gRPC UNAVAILABLE -> 500. So gate on a
# real round-trip across the whole mesh: signup (gateway->identity) + list
# (gateway->photo gRPC, read-only). When both succeed the mesh is warm.
say "waiting for the request mesh to warm up (timeout ${READY_TIMEOUT}s)…"
probe_cookie="$LOG_DIR/probe.cookie"
deadline=$(( $(date +%s) + READY_TIMEOUT ))
until curl -fsS "$HEALTH_URL" >/dev/null 2>&1 \
   && curl -fsS -c "$probe_cookie" -H 'content-type: application/json' \
        -d "{\"email\":\"ready-probe-$(date +%s%N)@example.com\",\"password\":\"secret123\",\"displayName\":\"Ready Probe\"}" \
        "$API_BASE_URL/auth/signup" >/dev/null 2>&1 \
   && curl -fsS -b "$probe_cookie" "$API_BASE_URL/photos" >/dev/null 2>&1; do
  [ "$(date +%s)" -lt "$deadline" ] || { $COMPOSE ps >&2; die "request mesh not ready after ${READY_TIMEOUT}s"; }
  sleep 2
done
rm -f "$probe_cookie"
say "mesh ready (gateway -> identity + photo round-trips succeed)"

# --- 8. run the live smoke (the actual assertion) ----------------------------
say "running live media smoke…"
make smoke-media   # streams to console — this is the actual assertion
say "PASSED ✅ (live stack validated end-to-end)"

# --- 9. log-correlation assertion (best-effort; see docs/e2e-structured-logging.md)
DC="$COMPOSE"
LOGS="$($DC logs --no-color 2>/dev/null)"
TRACE="$(printf '%s' "$LOGS" | grep -oE '"trace_id":"[a-f0-9]{32}"' | sort | uniq -c | sort -rn | head -1)"
say "smoke-stack: dominant trace line -> ${TRACE:-none}"
if printf '%s' "$LOGS" | grep -Eiq '"(password|passwordHash|cookie|authorization|uploadUrl)":"[^\[]'; then
  printf '%s' "$LOGS" | grep -Ei '"(password|passwordHash|cookie|authorization|uploadUrl)":"[^\[]' >&2
  say "smoke-stack: SECRET LEAK in logs"; exit 1
fi
say "smoke-stack: no unredacted secrets in logs"
