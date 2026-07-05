#!/usr/bin/env bash
# Smoke test for publication-service (session 017): create a draft post from a
# cluster node, then read/list/update it over the live HTTP<->gRPC<->Postgres
# path (dqb — new service + DB + cross-service cluster read).
# Preconditions: `make dev` + `make migrate` already running.
# Mirror structure: scripts/smoke-cluster.sh (reuses its fixture to get a ready
# clustering result, then drives the post flow on top of it).
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:3001}"
VENV_PYTHON="${VENV_PYTHON:-apps/media-worker/.venv/bin/python}"
TMP="${TMPDIR:-/tmp}/photoops-publication-smoke"
COOKIE_PATH="$TMP/session.cookie"
RESULT_PATH="$TMP/result.json"
POST_PATH="$TMP/post.json"

mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT
STAMP="$(date +%s)"

# ---------------------------------------------------------------------------
# 1. Sign up a unique user
# ---------------------------------------------------------------------------
curl -fsS -c "$COOKIE_PATH" -H 'content-type: application/json' \
  -d "{\"email\":\"pub-smoke-$STAMP@example.com\",\"password\":\"secret123\",\"displayName\":\"Pub Smoke\"}" \
  "$API_BASE_URL/auth/signup" >/dev/null

# ---------------------------------------------------------------------------
# EXIF-JPEG synth + upload helpers (same shape as smoke-cluster.sh)
# ---------------------------------------------------------------------------
gen_jpeg() {
  "$VENV_PYTHON" - "$1" "$2" "$3" "$4" <<'PY'
import io, sys
from PIL import Image
import piexif
out, dt, make, model = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
exif = {"0th": {piexif.ImageIFD.Make: make.encode(), piexif.ImageIFD.Model: model.encode()},
        "Exif": {}, "GPS": {}, "1st": {}, "thumbnail": None}
if dt:
    exif["Exif"][piexif.ExifIFD.DateTimeOriginal] = dt.encode()
    exif["Exif"][piexif.ExifIFD.OffsetTimeOriginal] = b"+00:00"
buf = io.BytesIO()
Image.new("RGB", (640, 480), color=(120, 150, 200)).save(buf, format="JPEG", exif=piexif.dump(exif), quality=80)
open(out, "wb").write(buf.getvalue())
PY
}

upload_photo() {
  local dt="$1" make="$2" model="$3"
  local jpeg="$TMP/p.jpg" intent="$TMP/intent.json"
  gen_jpeg "$jpeg" "$dt" "$make" "$model"
  local size; size="$(wc -c < "$jpeg" | tr -d ' ')"
  curl -fsS -b "$COOKIE_PATH" -H 'content-type: application/json' \
    -d "{\"filename\":\"p.jpg\",\"contentType\":\"image/jpeg\",\"sizeBytes\":\"$size\"}" \
    "$API_BASE_URL/photos/upload-intents" > "$intent"
  local pid url; pid="$(jq -r '.photoId' "$intent")"; url="$(jq -r '.uploadUrl' "$intent")"
  curl -fsS -X PUT -H 'content-type: image/jpeg' --data-binary "@$jpeg" "$url" >/dev/null
  curl -fsS -b "$COOKIE_PATH" -X POST "$API_BASE_URL/photos/$pid/complete-upload" >/dev/null
  echo "$pid"
}

# ---------------------------------------------------------------------------
# 2. Fixture: a Canon burst (two photos, one shooting episode)
# ---------------------------------------------------------------------------
P1="$(upload_photo "2024:06:15 10:00:00" "Canon" "EOS R5")"
P2="$(upload_photo "2024:06:15 10:05:00" "Canon" "EOS R5")"
echo "[smoke-publication] photos=$P1,$P2" >&2

for pid in "$P1" "$P2"; do
  DEADLINE=$(( $(date +%s) + 60 ))
  while true; do
    st="$(curl -fsS -b "$COOKIE_PATH" "$API_BASE_URL/photos/$pid" | jq -r '.status')"
    [ "$st" = "ready" ] && break
    if [ "$st" = "failed" ] || [ "$(date +%s)" -ge "$DEADLINE" ]; then
      echo "ERROR: photo $pid status=$st (expected ready)" >&2; exit 1
    fi
    sleep 2
  done
done

# ---------------------------------------------------------------------------
# 3. Cluster the photos and wait until ready
# ---------------------------------------------------------------------------
RESULT_ID="$(curl -fsS -b "$COOKIE_PATH" -H 'content-type: application/json' \
  -d '{"scope":"all","method":"time_only"}' \
  "$API_BASE_URL/v1/clusters/generate" | jq -r '.resultId')"
echo "[smoke-publication] result_id=$RESULT_ID" >&2

DEADLINE=$(( $(date +%s) + 60 ))
while true; do
  curl -fsS -b "$COOKIE_PATH" "$API_BASE_URL/v1/clustering-results/$RESULT_ID" > "$RESULT_PATH"
  st="$(jq -r '.status' "$RESULT_PATH")"
  [ "$st" = "ready" ] && break
  if [ "$st" = "failed" ] || [ "$(date +%s)" -ge "$DEADLINE" ]; then
    echo "ERROR: clustering status=$st (expected ready)" >&2; cat "$RESULT_PATH" >&2; exit 1
  fi
  sleep 2
done

# Pick the root node — its subtree is all the clustered photos — and record the
# expected photo count for the assertion below.
NODE_ID="$(jq -r '.root.id' "$RESULT_PATH")"
EXPECTED_COUNT="$(jq -r '.root.photoCount' "$RESULT_PATH")"
echo "[smoke-publication] node_id=$NODE_ID expected_photos=$EXPECTED_COUNT" >&2

# ---------------------------------------------------------------------------
# 4. Create a draft post from the cluster node
# ---------------------------------------------------------------------------
curl -fsS -b "$COOKIE_PATH" -H 'content-type: application/json' \
  -d "{\"resultId\":\"$RESULT_ID\",\"nodeId\":\"$NODE_ID\"}" \
  "$API_BASE_URL/v1/posts" > "$POST_PATH"
POST_ID="$(jq -r '.id' "$POST_PATH")"
echo "[smoke-publication] post_id=$POST_ID" >&2

jq -e --argjson n "$EXPECTED_COUNT" '
  .status == "draft"
  and .visibility == "private"
  and .sourceClusterId == "'"$NODE_ID"'"
  and .sourceResultId == "'"$RESULT_ID"'"
  and (.photos | length) == $n
  and (.dateFrom != "" and .dateFrom != null)
' "$POST_PATH" >/dev/null \
  || { echo "ASSERTION FAILED: created post is not a seeded private draft" >&2; cat "$POST_PATH" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 5. GetPost + ListPosts are owner-scoped and include the new post
# ---------------------------------------------------------------------------
curl -fsS -b "$COOKIE_PATH" "$API_BASE_URL/v1/posts/$POST_ID" \
  | jq -e '.id == "'"$POST_ID"'"' >/dev/null \
  || { echo "ASSERTION FAILED: GET /v1/posts/:id did not return the post" >&2; exit 1; }

curl -fsS -b "$COOKIE_PATH" "$API_BASE_URL/v1/posts" \
  | jq -e '[.posts[].id] | index("'"$POST_ID"'") != null' >/dev/null \
  || { echo "ASSERTION FAILED: post missing from GET /v1/posts" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 6. UpdatePost persists a new title
# ---------------------------------------------------------------------------
curl -fsS -b "$COOKIE_PATH" -X PATCH -H 'content-type: application/json' \
  -d '{"title":"Buenos Aires morning"}' \
  "$API_BASE_URL/v1/posts/$POST_ID" \
  | jq -e '.title == "Buenos Aires morning"' >/dev/null \
  || { echo "ASSERTION FAILED: PATCH title did not persist" >&2; exit 1; }

echo "[smoke-publication] OK" >&2
