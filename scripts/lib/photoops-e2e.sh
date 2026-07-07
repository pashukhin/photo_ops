# shellcheck shell=bash
# Shared e2e helpers for the live-stack scripts (smoke-publication.sh, seed-demo.sh).
#
# GLOBALS-DEPENDENT (not pure): the caller MUST define these before sourcing/using:
#   API_BASE_URL   — gateway base, e.g. http://localhost:3001
#   COOKIE_PATH    — path to the session cookie jar
#   VENV_PYTHON    — python with Pillow + piexif (apps/media-worker/.venv/bin/python)
#   TMP            — a writable scratch dir
# Script-level policy (set -euo pipefail, trap cleanup, unique-per-run identities)
# stays in the TOP-LEVEL scripts, not here.
#
# All helpers write progress to stderr and the captured value (id/slug/status) to
# stdout, so `x="$(helper ...)"` captures cleanly.

# --- auth ---------------------------------------------------------------------

# signup EMAIL PASSWORD DISPLAY_NAME — create an account and store its session cookie.
signup() {
  curl -fsS -c "$COOKIE_PATH" -H 'content-type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\",\"displayName\":\"$3\"}" \
    "$API_BASE_URL/auth/signup" >/dev/null
}

# login EMAIL PASSWORD — start a session for an existing account (non-zero on failure).
login() {
  curl -fsS -c "$COOKIE_PATH" -H 'content-type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
    "$API_BASE_URL/auth/login" >/dev/null
}

# --- photo fixture + upload ---------------------------------------------------

# gen_jpeg OUT DATETIME MAKE MODEL — write a 640x480 JPEG with EXIF to OUT.
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

# upload_photo DATETIME MAKE MODEL — gen a JPEG, run intent→PUT→complete; echo photo id.
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

# wait_photo_ready PHOTO_ID [TIMEOUT_SECS] — poll until 'ready' (fail on 'failed'/timeout).
wait_photo_ready() {
  local pid="$1" deadline; deadline=$(( $(date +%s) + "${2:-60}" ))
  while true; do
    local st; st="$(curl -fsS -b "$COOKIE_PATH" "$API_BASE_URL/photos/$pid" | jq -r '.status')"
    [ "$st" = "ready" ] && return 0
    if [ "$st" = "failed" ] || [ "$(date +%s)" -ge "$deadline" ]; then
      echo "ERROR: photo $pid status=$st (expected ready)" >&2; return 1
    fi
    sleep 2
  done
}

# --- clustering ---------------------------------------------------------------

# generate_cluster [METHOD] — POST generate; echo result id.
generate_cluster() {
  curl -fsS -b "$COOKIE_PATH" -H 'content-type: application/json' \
    -d "{\"scope\":\"all\",\"method\":\"${1:-time_only}\"}" \
    "$API_BASE_URL/v1/clusters/generate" | jq -r '.resultId'
}

# wait_cluster_ready RESULT_ID OUT_JSON [TIMEOUT_SECS] — poll until ready, save result JSON.
wait_cluster_ready() {
  local rid="$1" out="$2" deadline; deadline=$(( $(date +%s) + "${3:-60}" ))
  while true; do
    curl -fsS -b "$COOKIE_PATH" "$API_BASE_URL/v1/clustering-results/$rid" > "$out"
    local st; st="$(jq -r '.status' "$out")"
    [ "$st" = "ready" ] && return 0
    if [ "$st" = "failed" ] || [ "$(date +%s)" -ge "$deadline" ]; then
      echo "ERROR: clustering $rid status=$st (expected ready)" >&2; cat "$out" >&2; return 1
    fi
    sleep 2
  done
}

# --- posts --------------------------------------------------------------------

# create_post RESULT_ID NODE_ID — POST a draft from a node; echo post id.
create_post() {
  curl -fsS -b "$COOKIE_PATH" -H 'content-type: application/json' \
    -d "{\"resultId\":\"$1\",\"nodeId\":\"$2\"}" \
    "$API_BASE_URL/v1/posts" | jq -r '.id'
}

# publish_post POST_ID [VISIBILITY] — publish; echo slug.
publish_post() {
  curl -fsS -b "$COOKIE_PATH" -H 'content-type: application/json' \
    -d "{\"visibility\":\"${2:-public}\"}" \
    "$API_BASE_URL/v1/posts/$1/publish" | jq -r '.slug'
}
