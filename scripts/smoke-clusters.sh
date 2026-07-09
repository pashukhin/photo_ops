#!/usr/bin/env bash
# Live smoke for the session-023 cluster workspace + manual location (dqb: UI render +
# HTTP<->gRPC<->Postgres for the new SetPhotoLocation / DeleteClusteringResult RPCs).
# Seeds a fresh user with DISTINCT-GPS/time photos + a ready cluster, asserts the new
# API boundaries over curl (set-location round-trip + negative IDOR + soft-delete),
# then drives the workspace UI RENDER (Leaflet markers + histogram bars + delete) via
# apps/web/smoke/clusters.smoke.ts using the seeded session cookie.
# Preconditions: `make dev` + `make migrate` running with the session-023 images.
# Mirror structure: scripts/smoke-publication.sh.
set -euo pipefail

cd "$(dirname "$0")/.."
API_BASE_URL="${API_BASE_URL:-http://localhost:3001}"
VENV_PYTHON="${VENV_PYTHON:-apps/media-worker/.venv/bin/python}"
TMP="${TMPDIR:-/tmp}/photoops-clusters-smoke"
COOKIE_PATH="$TMP/session.cookie"
SMOKE_WEB_URL="${SMOKE_WEB_URL:-http://localhost:3000}"

mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT
STAMP="$(date +%s)"
log() { echo "smoke-clusters: $*" >&2; }

# shellcheck source=scripts/lib/photoops-e2e.sh
. scripts/lib/photoops-e2e.sh

EMAIL="clusters-smoke-$STAMP@example.com"
PASSWORD="secret123"
log "signup $EMAIL"
signup "$EMAIL" "$PASSWORD" "Clusters Smoke"

# Two photos at DISTINCT GPS points + times so the map spreads and the histogram has
# >=2 bins (Moscow, then Buenos Aires — five days apart).
log "uploading 2 distinct-GPS photos"
P1="$(upload_photo "2024:06:15 10:00:00" "Canon" "EOS R5" 55.75 37.62)"
P2="$(upload_photo "2024:06:20 14:00:00" "Canon" "EOS R5" -34.60 -58.38)"
wait_photo_ready "$P1"
wait_photo_ready "$P2"
log "photos ready: $P1 (Moscow), $P2 (Buenos Aires)"

# --- SetPhotoLocation: HTTP -> gRPC -> photo-db -> read back -------------------
log "SetPhotoLocation on $P1 -> Paris"
curl -fsS -b "$COOKIE_PATH" -H 'content-type: application/json' \
  -d '{"place":{"continent":"Europe","country":"France","region":"","city":"Paris","district":""},"lat":48.8566,"lon":2.3522}' \
  "$API_BASE_URL/photos/$P1/location" > "$TMP/setloc.json"
CITY="$(jq -r '.location.city' "$TMP/setloc.json")"
[ "$CITY" = "Paris" ] || { echo "ERROR: set-location reply city=$CITY (want Paris)" >&2; cat "$TMP/setloc.json" >&2; exit 1; }
GET_CITY="$(curl -fsS -b "$COOKIE_PATH" "$API_BASE_URL/photos/$P1" | jq -r '.location.city')"
[ "$GET_CITY" = "Paris" ] || { echo "ERROR: GET city=$GET_CITY (want Paris)" >&2; exit 1; }
log "set-location OK (Paris persists on GET)"

# --- negative IDOR: set-location on an unknown photo id -> 404 -----------------
IDOR="$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_PATH" -H 'content-type: application/json' \
  -d '{"place":{"city":"Nope"}}' "$API_BASE_URL/photos/00000000-0000-7000-8000-000000000000/location")"
[ "$IDOR" = "404" ] || { echo "ERROR: IDOR set-location expected 404, got $IDOR" >&2; exit 1; }
log "IDOR set-location -> 404 OK"

# --- DeleteClusteringResult: soft-delete -> gone ------------------------------
RID="$(generate_cluster time_only)"
wait_cluster_ready "$RID" "$TMP/result.json"
DEL="$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_PATH" -X DELETE "$API_BASE_URL/v1/clustering-results/$RID")"
[ "$DEL" = "200" ] || { echo "ERROR: delete expected 200, got $DEL" >&2; exit 1; }
GONE="$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_PATH" "$API_BASE_URL/v1/clustering-results/$RID")"
[ "$GONE" = "404" ] || { echo "ERROR: get-after-delete expected 404, got $GONE" >&2; exit 1; }
REDEL="$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_PATH" -X DELETE "$API_BASE_URL/v1/clustering-results/$RID")"
[ "$REDEL" = "404" ] || { echo "ERROR: re-delete expected 404, got $REDEL" >&2; exit 1; }
log "delete-run soft-delete OK (get->404, re-delete->404)"

# --- seed a fresh cluster for the browser render smoke ------------------------
RID2="$(generate_cluster time_only)"
wait_cluster_ready "$RID2" "$TMP/result2.json"
log "cluster $RID2 ready for the UI render smoke"

# --- UI render (Playwright), authed via the seeded session cookie -------------
SESSION_COOKIE="$(awk '$6=="photoops_session"{print $7}' "$COOKIE_PATH" | tail -1)"
[ -n "$SESSION_COOKIE" ] || { echo "ERROR: could not extract session cookie" >&2; cat "$COOKIE_PATH" >&2; exit 1; }
log "driving the workspace UI render (Playwright)"
pnpm --filter @photoops/web exec playwright install chromium >/dev/null 2>&1 || true
SMOKE_CLUSTERS_COOKIE="$SESSION_COOKIE" SMOKE_WEB_URL="$SMOKE_WEB_URL" \
  pnpm --filter @photoops/web exec playwright test smoke/clusters.smoke.ts

log "ALL cluster-workspace + manual-location smoke checks passed"
