#!/usr/bin/env sh
set -eu

API_BASE_URL="${API_BASE_URL:-http://localhost:3001}"
TMP_DIR="${TMPDIR:-/tmp}/photoops-auth-smoke"
COOKIE_A="$TMP_DIR/user-a.cookie"
COOKIE_B="$TMP_DIR/user-b.cookie"
JPEG_PATH="$TMP_DIR/smoke.jpg"
INTENT_PATH="$TMP_DIR/intent.json"
LIST_A_PATH="$TMP_DIR/list-a.json"
LIST_B_PATH="$TMP_DIR/list-b.json"
COMPLETE_B_PATH="$TMP_DIR/complete-b.json"
STAMP="$(date +%s)"

mkdir -p "$TMP_DIR"

python3 - <<'PY' "$JPEG_PATH"
from pathlib import Path
import base64
import sys

Path(sys.argv[1]).write_bytes(base64.b64decode(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Al//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z"
))
PY

curl -fsS -c "$COOKIE_A" -H 'content-type: application/json' -d "{\"email\":\"user-a-$STAMP@example.com\",\"password\":\"secret123\",\"displayName\":\"User A\"}" "$API_BASE_URL/auth/signup" >/dev/null

curl -fsS -b "$COOKIE_A" -H 'content-type: application/json' -d "{\"filename\":\"smoke.jpg\",\"contentType\":\"image/jpeg\",\"sizeBytes\":\"$(wc -c < "$JPEG_PATH" | tr -d ' ')\"}" "$API_BASE_URL/photos/upload-intents" > "$INTENT_PATH"

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
curl -fsS -b "$COOKIE_A" -X POST "$API_BASE_URL/photos/$PHOTO_ID/complete-upload" >/dev/null
curl -fsS -b "$COOKIE_A" "$API_BASE_URL/photos" > "$LIST_A_PATH"

curl -fsS -c "$COOKIE_B" -H 'content-type: application/json' -d "{\"email\":\"user-b-$STAMP@example.com\",\"password\":\"secret123\",\"displayName\":\"User B\"}" "$API_BASE_URL/auth/signup" >/dev/null
curl -fsS -b "$COOKIE_B" "$API_BASE_URL/photos" > "$LIST_B_PATH"

STATUS_B="$(curl -sS -o "$COMPLETE_B_PATH" -w '%{http_code}' -b "$COOKIE_B" -X POST "$API_BASE_URL/photos/$PHOTO_ID/complete-upload")"

python3 - <<'PY' "$PHOTO_ID" "$LIST_A_PATH" "$LIST_B_PATH" "$STATUS_B"
import json, sys
photo_id, list_a_path, list_b_path, status_b = sys.argv[1:]
photos_a = json.load(open(list_a_path)).get("photos", [])
photos_b = json.load(open(list_b_path)).get("photos", [])
if not any(photo.get("id") == photo_id and str(photo.get("status")).lower().endswith("uploaded") for photo in photos_a):
    raise SystemExit("user A uploaded photo not found")
if any(photo.get("id") == photo_id for photo in photos_b):
    raise SystemExit("user B can list user A photo")
if status_b not in {"404", "500"}:
    raise SystemExit(f"unexpected cross-user complete status {status_b}")
print("auth upload ownership smoke ok")
PY
