#!/usr/bin/env sh
set -eu

API_BASE_URL="${API_BASE_URL:-http://localhost:3001}"
TMP_DIR="${TMPDIR:-/tmp}/photoops-smoke"
COOKIE_PATH="$TMP_DIR/session.cookie"
JPEG_PATH="$TMP_DIR/smoke.jpg"
INTENT_PATH="$TMP_DIR/intent.json"
COMPLETE_PATH="$TMP_DIR/complete.json"
LIST_PATH="$TMP_DIR/list.json"

mkdir -p "$TMP_DIR"

python3 - <<'PY' "$JPEG_PATH"
from pathlib import Path
import base64
import sys

Path(sys.argv[1]).write_bytes(base64.b64decode(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Al//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z"
))
PY

STAMP="$(date +%s)"
curl -fsS -c "$COOKIE_PATH" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"smoke-$STAMP@example.com\",\"password\":\"secret123\",\"displayName\":\"Smoke User\"}" \
  "$API_BASE_URL/auth/signup" >/dev/null

curl -fsS \
  -b "$COOKIE_PATH" \
  -H 'content-type: application/json' \
  -d "{\"filename\":\"smoke.jpg\",\"contentType\":\"image/jpeg\",\"sizeBytes\":\"$(wc -c < "$JPEG_PATH" | tr -d ' ')\"}" \
  "$API_BASE_URL/photos/upload-intents" > "$INTENT_PATH"

PHOTO_ID="$(python3 - <<'PY' "$INTENT_PATH"
import json, sys
print(json.load(open(sys.argv[1]))["photoId"])
PY
)"

UPLOAD_URL="$(python3 - <<'PY' "$INTENT_PATH"
import json, sys
print(json.load(open(sys.argv[1]))["uploadUrl"])
PY
)"

curl -fsS -X PUT -H 'content-type: image/jpeg' --data-binary "@$JPEG_PATH" "$UPLOAD_URL" >/dev/null
curl -fsS -b "$COOKIE_PATH" -X POST "$API_BASE_URL/photos/$PHOTO_ID/complete-upload" > "$COMPLETE_PATH"
curl -fsS -b "$COOKIE_PATH" "$API_BASE_URL/photos" > "$LIST_PATH"

python3 - <<'PY' "$PHOTO_ID" "$LIST_PATH"
import json, sys
photo_id = sys.argv[1]
photos = json.load(open(sys.argv[2])).get("photos", [])
if not any(photo.get("id") == photo_id and str(photo.get("status")).lower().endswith("uploaded") for photo in photos):
    raise SystemExit("uploaded smoke photo not found in list response")
print("smoke upload ok")
PY
