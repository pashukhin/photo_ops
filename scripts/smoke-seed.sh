#!/usr/bin/env bash
# RED until seed-demo.sh is implemented (photo_ops-pht). dqb: the seed crosses
# HTTP<->gRPC<->Postgres<->MinIO; idempotency (same published slug on re-run) is the
# invariant under test. Local-only — requires `make dev` + `make migrate` running.
set -euo pipefail

SEED="$(dirname "$0")/seed-demo.sh"

SLUG1="$("$SEED" | sed -n 's/^SLUG=//p')"
SLUG2="$("$SEED" | sed -n 's/^SLUG=//p')"   # re-run must be idempotent

[ -n "$SLUG1" ] || { echo "ASSERTION FAILED: seed-demo.sh printed no SLUG= line" >&2; exit 1; }
[ "$SLUG1" = "$SLUG2" ] \
  || { echo "ASSERTION FAILED: slug not stable across runs ($SLUG1 != $SLUG2)" >&2; exit 1; }

WEB_BASE_URL="${WEB_BASE_URL:-http://localhost:3000}"
code="$(curl -s -o /dev/null -w '%{http_code}' "$WEB_BASE_URL/posts/$SLUG1")"
[ "$code" = "200" ] \
  || { echo "ASSERTION FAILED: public page /posts/$SLUG1 returned $code (expected 200)" >&2; exit 1; }

echo "[smoke-seed] OK slug=$SLUG1"
