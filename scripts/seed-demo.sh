#!/usr/bin/env bash
# Idempotent demo seed (photo_ops-pht): ensure demo@photoops.local has a published
# post drafted from a ready cluster, and print `SLUG=<published-slug>`.
#
# Idempotency converges on a fully-published run: if a published post with the fixed
# seed TITLE already exists, reuse its slug (opaque + immutable — stability comes from
# detect-and-reuse, not re-minting). A crash before publish leaves no marker → a
# re-run rebuilds (may orphan the earlier photos/cluster) — accepted for a demo seed.
#
# Preconditions: `make dev` + `make migrate` running; apps/media-worker/.venv present.
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:3001}"
WEB_ORIGIN="${WEB_ORIGIN:-http://localhost:3000}"
VENV_PYTHON="${VENV_PYTHON:-apps/media-worker/.venv/bin/python}"
TMP="${TMPDIR:-/tmp}/photoops-seed-demo"
COOKIE_PATH="$TMP/session.cookie"

DEMO_EMAIL="demo@photoops.local"
DEMO_PASS="demo12345"
DEMO_NAME="PhotoOps Demo"
SEED_TITLE="PhotoOps demo — first outing"
SEED_BODY="A short walk captured over a few minutes — the demo photo story."

mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT

# shellcheck source=scripts/lib/photoops-e2e.sh
. "$(dirname "$0")/lib/photoops-e2e.sh"

log() { echo "[seed-demo] $*" >&2; }

# --- 1. demo account: login, else signup ------------------------------------
if login "$DEMO_EMAIL" "$DEMO_PASS" 2>/dev/null; then
  log "signed in as $DEMO_EMAIL"
else
  log "no demo account; signing up $DEMO_EMAIL"
  signup "$DEMO_EMAIL" "$DEMO_PASS" "$DEMO_NAME"
fi

# --- 2. idempotency marker: reuse an existing published seed post ------------
EXISTING_ID="$(curl -fsS -b "$COOKIE_PATH" "$API_BASE_URL/v1/posts" \
  | jq -r --arg t "$SEED_TITLE" 'first(.posts[] | select(.status=="published" and .title==$t) | .id) // empty')"
if [ -n "$EXISTING_ID" ]; then
  SLUG="$(curl -fsS -b "$COOKIE_PATH" "$API_BASE_URL/v1/posts/$EXISTING_ID" | jq -r '.slug')"
  log "already seeded → reusing published post $EXISTING_ID"
  log "public URL: $WEB_ORIGIN/posts/$SLUG"
  echo "SLUG=$SLUG"
  exit 0
fi

# --- 3. build: photos → cluster → post → publish ----------------------------
log "seeding a fresh demo dataset"
P1="$(upload_photo "2024:06:15 10:00:00" "Canon" "EOS R5")"
P2="$(upload_photo "2024:06:15 10:05:00" "Canon" "EOS R5")"
log "photos=$P1,$P2 — waiting for ready"
wait_photo_ready "$P1"
wait_photo_ready "$P2"

RESULT_ID="$(generate_cluster time_only)"
log "cluster result_id=$RESULT_ID — waiting for ready"
RESULT_JSON="$TMP/result.json"
wait_cluster_ready "$RESULT_ID" "$RESULT_JSON"

NODE_ID="$(jq -r '.root.children[0].id' "$RESULT_JSON")"
[ -n "$NODE_ID" ] && [ "$NODE_ID" != "null" ] \
  || { echo "ERROR: no selectable child node in cluster $RESULT_ID" >&2; cat "$RESULT_JSON" >&2; exit 1; }

POST_ID="$(create_post "$RESULT_ID" "$NODE_ID")"
log "draft post_id=$POST_ID"

# Title (the idempotency marker) + body, then a caption on the first photo.
POST_JSON="$TMP/post.json"
curl -fsS -b "$COOKIE_PATH" -X PATCH -H 'content-type: application/json' \
  -d "{\"title\":\"$SEED_TITLE\",\"body\":\"$SEED_BODY\"}" \
  "$API_BASE_URL/v1/posts/$POST_ID" > "$POST_JSON"
CAPTIONED="$(jq -c '[.photos | sort_by(.order) | to_entries[]
  | {photoId: .value.photoId, caption: (if .key == 0 then "Setting out" else (.value.caption // "") end)}]' "$POST_JSON")"
curl -fsS -b "$COOKIE_PATH" -X PATCH -H 'content-type: application/json' \
  -d "{\"photos\":$CAPTIONED}" "$API_BASE_URL/v1/posts/$POST_ID" >/dev/null

SLUG="$(publish_post "$POST_ID" public)"
[ -n "$SLUG" ] && [ "$SLUG" != "null" ] \
  || { echo "ERROR: publish did not return a slug for $POST_ID" >&2; exit 1; }
log "published → public URL: $WEB_ORIGIN/posts/$SLUG"
echo "SLUG=$SLUG"
