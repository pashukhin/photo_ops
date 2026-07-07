#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:3001}"
VENV_PYTHON="${VENV_PYTHON:-apps/media-worker/.venv/bin/python}"
TMP="${TMPDIR:-/tmp}/photoops-media-smoke"
COOKIE_PATH="$TMP/session.cookie"
JPEG_PATH="$TMP/sample.jpg"
INTENT_PATH="$TMP/intent.json"
PHOTO_PATH="$TMP/photo.json"

mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT

STAMP="$(date +%s)"

# ---------------------------------------------------------------------------
# 1. Sign up a unique test user and obtain a session cookie
# ---------------------------------------------------------------------------
curl -fsS \
  -c "$COOKIE_PATH" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"media-smoke-$STAMP@example.com\",\"password\":\"secret123\",\"displayName\":\"Media Smoke\"}" \
  "$API_BASE_URL/auth/signup" >/dev/null

# ---------------------------------------------------------------------------
# 2. Generate a test JPEG with EXIF (DateTimeOriginal + OffsetTime + GPS)
# ---------------------------------------------------------------------------
"$VENV_PYTHON" - "$JPEG_PATH" <<'PY'
import sys
from PIL import Image
import piexif
import io

out_path = sys.argv[1]

# Create a 1200x800 RGB image
img = Image.new("RGB", (1200, 800), color=(100, 149, 237))

# Build EXIF bytes
exif_dict = {
    "0th": {},
    "Exif": {
        piexif.ExifIFD.DateTimeOriginal: b"2024:06:15 14:30:00",
        piexif.ExifIFD.OffsetTimeOriginal: b"+03:00",
    },
    "GPS": {
        piexif.GPSIFD.GPSLatitudeRef: b"N",
        piexif.GPSIFD.GPSLatitude: ((55, 1), (45, 1), (0, 1)),
        piexif.GPSIFD.GPSLongitudeRef: b"E",
        piexif.GPSIFD.GPSLongitude: ((37, 1), (37, 1), (0, 1)),
    },
    "1st": {},
    "thumbnail": None,
}
exif_bytes = piexif.dump(exif_dict)

buf = io.BytesIO()
img.save(buf, format="JPEG", exif=exif_bytes, quality=85)
with open(out_path, "wb") as f:
    f.write(buf.getvalue())

print(f"Generated EXIF JPEG: {out_path} ({len(buf.getvalue())} bytes)", file=sys.stderr)
PY

# ---------------------------------------------------------------------------
# 3. Create an upload intent
# ---------------------------------------------------------------------------
SIZE_BYTES="$(wc -c < "$JPEG_PATH" | tr -d ' ')"
curl -fsS \
  -b "$COOKIE_PATH" \
  -H 'content-type: application/json' \
  -d "{\"filename\":\"sample.jpg\",\"contentType\":\"image/jpeg\",\"sizeBytes\":\"$SIZE_BYTES\"}" \
  "$API_BASE_URL/photos/upload-intents" > "$INTENT_PATH"

PHOTO_ID="$(jq -r '.photoId' "$INTENT_PATH")"
UPLOAD_URL="$(jq -r '.uploadUrl' "$INTENT_PATH")"

echo "[smoke-media] photo_id=$PHOTO_ID" >&2

# ---------------------------------------------------------------------------
# 4. PUT the JPEG to the presigned MinIO URL
# ---------------------------------------------------------------------------
curl -fsS \
  -X PUT \
  -H 'content-type: image/jpeg' \
  --data-binary "@$JPEG_PATH" \
  "$UPLOAD_URL" >/dev/null

# ---------------------------------------------------------------------------
# 5. Complete the upload
# ---------------------------------------------------------------------------
curl -fsS \
  -b "$COOKIE_PATH" \
  -X POST \
  "$API_BASE_URL/photos/$PHOTO_ID/complete-upload" >/dev/null

# ---------------------------------------------------------------------------
# 6. Poll GET /photos/:id until status == ready (2 s interval, 60 s timeout)
# ---------------------------------------------------------------------------
DEADLINE=$(( $(date +%s) + 60 ))
STATUS=""
while true; do
  curl -fsS -b "$COOKIE_PATH" "$API_BASE_URL/photos/$PHOTO_ID" > "$PHOTO_PATH"
  STATUS="$(jq -r '.status' "$PHOTO_PATH")"
  if [ "$STATUS" = "ready" ]; then
    break
  fi
  if [ "$STATUS" = "failed" ]; then
    echo "ERROR: photo status is 'failed'. Last response:" >&2
    cat "$PHOTO_PATH" >&2
    echo "" >&2
    echo "HINT: stack/broker/MinIO issue — check \`make logs\` and escalate (do not hand-patch infra)" >&2
    exit 1
  fi
  if [ "$(date +%s)" -ge "$DEADLINE" ]; then
    echo "ERROR: timed out waiting for status=ready after 60s. Last response:" >&2
    cat "$PHOTO_PATH" >&2
    echo "" >&2
    echo "HINT: stack/broker/MinIO issue — check \`make logs\` and escalate (do not hand-patch infra)" >&2
    exit 1
  fi
  echo "[smoke-media] status=$STATUS — waiting..." >&2
  sleep 2
done

# ---------------------------------------------------------------------------
# 7. Assert all expected fields
# ---------------------------------------------------------------------------
"$VENV_PYTHON" - "$PHOTO_PATH" <<'PY'
import json, sys

path = sys.argv[1]
photo = json.load(open(path))


def fail(msg):
    print(f"ASSERTION FAILED: {msg}", file=sys.stderr)
    print("Full response:", file=sys.stderr)
    print(json.dumps(photo, indent=2), file=sys.stderr)
    print(
        "HINT: stack/broker/MinIO issue — check `make logs` and escalate (do not hand-patch infra)",
        file=sys.stderr,
    )
    sys.exit(1)


# status
if photo.get("status") != "ready":
    fail(f"expected status=ready, got {photo.get('status')!r}")

# variants (API field is "variantType", not "type")
variants = photo.get("variants", [])
if len(variants) != 2:
    fail(f"expected 2 variants, got {len(variants)}: {[v.get('variantType') for v in variants]}")

variant_types = {v.get("variantType") for v in variants}
if "thumbnail" not in variant_types:
    fail(f"missing 'thumbnail' variant; found: {variant_types}")
if "preview" not in variant_types:
    fail(f"missing 'preview' variant; found: {variant_types}")

for v in variants:
    if not v.get("url"):
        fail(f"variant {v.get('variantType')!r} has empty url")
    if not (isinstance(v.get("width"), (int, float)) and v["width"] > 0):
        fail(f"variant {v.get('variantType')!r} has non-positive width: {v.get('width')!r}")
    if not (isinstance(v.get("height"), (int, float)) and v["height"] > 0):
        fail(f"variant {v.get('variantType')!r} has non-positive height: {v.get('height')!r}")

# image dimensions
if not (isinstance(photo.get("width"), (int, float)) and photo["width"] > 0):
    fail(f"photo.width is not a positive number: {photo.get('width')!r}")
if not (isinstance(photo.get("height"), (int, float)) and photo["height"] > 0):
    fail(f"photo.height is not a positive number: {photo.get('height')!r}")

# EXIF timestamps
if not photo.get("takenAtLocal"):
    fail(f"takenAtLocal is empty or missing: {photo.get('takenAtLocal')!r}")
if not photo.get("takenAtUtc"):
    fail(f"takenAtUtc is empty or missing: {photo.get('takenAtUtc')!r}")
if photo.get("takenAtTzSource") != "exif_offset":
    fail(f"expected takenAtTzSource=exif_offset, got {photo.get('takenAtTzSource')!r}")

# GPS
if photo.get("lat") is None:
    fail("lat is missing from photo")
if photo.get("lon") is None:
    fail("lon is missing from photo")

print("SMOKE OK — status=ready, 2 variants (thumbnail+preview), EXIF+GPS attrs present")
PY

# ---------------------------------------------------------------------------
# 8. Permanent failure (photo_ops-0od): a corrupt (non-image) object is a genuinely
#    permanent error — it must reach 'failed', NOT stay stuck in 'processing' and NOT
#    falsely become 'ready'. (Transient storage hiccups are retried, not failed; that
#    path is not live-injectable and is covered by the media-worker unit tests.)
# ---------------------------------------------------------------------------
CORRUPT_PATH="$TMP/corrupt.jpg"
printf 'this is not a JPEG' > "$CORRUPT_PATH"
CSIZE="$(wc -c < "$CORRUPT_PATH" | tr -d ' ')"
curl -fsS -b "$COOKIE_PATH" -H 'content-type: application/json' \
  -d "{\"filename\":\"corrupt.jpg\",\"contentType\":\"image/jpeg\",\"sizeBytes\":\"$CSIZE\"}" \
  "$API_BASE_URL/photos/upload-intents" > "$INTENT_PATH"
CPID="$(jq -r '.photoId' "$INTENT_PATH")"
CUP_URL="$(jq -r '.uploadUrl' "$INTENT_PATH")"
curl -fsS -X PUT -H 'content-type: image/jpeg' --data-binary "@$CORRUPT_PATH" "$CUP_URL" >/dev/null
curl -fsS -b "$COOKIE_PATH" -X POST "$API_BASE_URL/photos/$CPID/complete-upload" >/dev/null
echo "[smoke-media] corrupt photo_id=$CPID — expecting failed" >&2

DEADLINE=$(( $(date +%s) + 60 ))
while true; do
  CST="$(curl -fsS -b "$COOKIE_PATH" "$API_BASE_URL/photos/$CPID" | jq -r '.status')"
  [ "$CST" = "failed" ] && break
  if [ "$CST" = "ready" ]; then
    echo "ASSERTION FAILED: corrupt image reached 'ready' (expected 'failed')" >&2; exit 1
  fi
  if [ "$(date +%s)" -ge "$DEADLINE" ]; then
    echo "ASSERTION FAILED: corrupt image stuck at '$CST' after 60s (expected 'failed')" >&2; exit 1
  fi
  sleep 2
done
echo "[smoke-media] OK — corrupt image → failed (permanent branch)" >&2
