#!/usr/bin/env bash
# Smoke test for usage accounting (session 012).
# Preconditions: `make dev` + `make migrate` already running.
# Mirror structure: scripts/smoke-media-processing.sh
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:3001}"
VENV_PYTHON="${VENV_PYTHON:-apps/media-worker/.venv/bin/python}"
TMP="${TMPDIR:-/tmp}/photoops-usage-smoke"
COOKIE_PATH="$TMP/session.cookie"
JPEG_PATH="$TMP/sample.jpg"
INTENT_PATH="$TMP/intent.json"
PHOTO_PATH="$TMP/photo.json"
SUMMARY_PATH="$TMP/summary.json"

mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT

STAMP="$(date +%s)"

# ---------------------------------------------------------------------------
# 1. Sign up a unique test user and obtain a session cookie
# ---------------------------------------------------------------------------
curl -fsS \
  -c "$COOKIE_PATH" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"usage-smoke-$STAMP@example.com\",\"password\":\"secret123\",\"displayName\":\"Usage Smoke\"}" \
  "$API_BASE_URL/auth/signup" >/dev/null

# ---------------------------------------------------------------------------
# 2. Generate a test JPEG
# ---------------------------------------------------------------------------
"$VENV_PYTHON" - "$JPEG_PATH" <<'PY'
import sys
from PIL import Image
import piexif
import io

out_path = sys.argv[1]

img = Image.new("RGB", (1200, 800), color=(100, 149, 237))

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

echo "[smoke-usage] photo_id=$PHOTO_ID" >&2

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
  echo "[smoke-usage] photo status=$STATUS — waiting for ready..." >&2
  sleep 2
done

echo "[smoke-usage] photo ready — fetching usage summary" >&2

# ---------------------------------------------------------------------------
# 7. GET /v1/usage/summary (authed) and assert the response
# ---------------------------------------------------------------------------
# Allow a brief settling window: usage-service may still be processing the
# RabbitMQ events published by photo-service after status=ready is returned.
USAGE_DEADLINE=$(( $(date +%s) + 30 ))
while true; do
  HTTP_STATUS="$(curl -fsS -o "$SUMMARY_PATH" -w "%{http_code}" \
    -b "$COOKIE_PATH" \
    "$API_BASE_URL/v1/usage/summary" 2>/dev/null || echo "000")"

  if [ "$HTTP_STATUS" = "200" ]; then
    # Check that we have the expected photo_processed line with quantity >= 1
    PROCESSED_QTY="$(jq '[.lines[] | select(.eventType == "photo_processed")] | map(.totalQuantity | tonumber) | add // 0' "$SUMMARY_PATH")"
    if [ "$PROCESSED_QTY" -ge 1 ] 2>/dev/null; then
      break
    fi
  fi

  if [ "$(date +%s)" -ge "$USAGE_DEADLINE" ]; then
    echo "ERROR: timed out waiting for usage summary with photo_processed line. Last response:" >&2
    cat "$SUMMARY_PATH" >&2
    echo "" >&2
    echo "HINT: check usage-service logs (\`make logs-svc svc=usage-service\`) — RabbitMQ consumer or DB may be unhealthy" >&2
    exit 1
  fi
  echo "[smoke-usage] waiting for usage events to settle..." >&2
  sleep 2
done

"$VENV_PYTHON" - "$SUMMARY_PATH" <<'PY'
import json, sys

path = sys.argv[1]
summary = json.load(open(path))


def fail(msg):
    print(f"ASSERTION FAILED: {msg}", file=sys.stderr)
    print("Full response:", file=sys.stderr)
    print(json.dumps(summary, indent=2), file=sys.stderr)
    print(
        "HINT: check usage-service logs (`make logs-svc svc=usage-service`) — RabbitMQ consumer or DB may be unhealthy",
        file=sys.stderr,
    )
    sys.exit(1)


lines = summary.get("lines", [])
lines_by_type = {l["eventType"]: l for l in lines}

# Assert photo_original_stored storage line is present
if "photo_original_stored" not in lines_by_type:
    fail(f"expected a 'photo_original_stored' line; found event_types: {list(lines_by_type.keys())}")

# Assert photo_processed processing line is present with total_quantity == 1
if "photo_processed" not in lines_by_type:
    fail(f"expected a 'photo_processed' line; found event_types: {list(lines_by_type.keys())}")

processed_line = lines_by_type["photo_processed"]
qty = int(processed_line.get("totalQuantity", 0))
if qty < 1:
    fail(f"expected photo_processed.total_quantity >= 1, got {qty!r}")

# Assert estimated_monthly_cost is a well-formed 2-decimal USD amount.
# NOTE: a single small smoke photo (~16KB) costs a sub-cent amount at realistic
# storage rates, so it legitimately rounds to "0.00". We validate the FORMAT (the
# pricing layer ran and produced a 2-decimal money string), not a positive value —
# the substantive e2e signal is the raw metering lines above. A realistic photo
# bank produces a visible non-zero cost.
cost_str = summary.get("estimatedMonthlyCost", "")
parts = cost_str.split(".")
if len(parts) != 2 or not parts[0].isdigit() or len(parts[1]) != 2 or not parts[1].isdigit():
    fail(f"estimatedMonthlyCost is not a 2-decimal USD string: {cost_str!r}")

# Assert currency is USD
currency = summary.get("currency", "")
if currency != "USD":
    fail(f"expected currency=USD, got {currency!r}")

print(f"SMOKE USAGE OK — photo_original_stored present, photo_processed qty={qty}, cost={cost_str} {currency}")
PY

# ---------------------------------------------------------------------------
# 8. Idempotency: re-fetch the summary and assert it is stable
# ---------------------------------------------------------------------------
echo "[smoke-usage] verifying idempotency (re-fetch summary)" >&2

SUMMARY2_PATH="$TMP/summary2.json"
curl -fsS \
  -b "$COOKIE_PATH" \
  "$API_BASE_URL/v1/usage/summary" > "$SUMMARY2_PATH"

"$VENV_PYTHON" - "$SUMMARY_PATH" "$SUMMARY2_PATH" <<'PY'
import json, sys

s1 = json.load(open(sys.argv[1]))
s2 = json.load(open(sys.argv[2]))


def fail(msg):
    print(f"ASSERTION FAILED: {msg}", file=sys.stderr)
    print("First summary:", file=sys.stderr)
    print(json.dumps(s1, indent=2), file=sys.stderr)
    print("Second summary:", file=sys.stderr)
    print(json.dumps(s2, indent=2), file=sys.stderr)
    sys.exit(1)


# totalQuantity for photo_processed must be the same in both fetches
def get_processed_qty(s):
    for l in s.get("lines", []):
        if l["eventType"] == "photo_processed":
            return int(l.get("totalQuantity", 0))
    return 0


qty1 = get_processed_qty(s1)
qty2 = get_processed_qty(s2)
if qty1 != qty2:
    fail(f"idempotency check failed: photo_processed total_quantity changed from {qty1} to {qty2} on re-fetch")

cost1 = s1.get("estimatedMonthlyCost", "")
cost2 = s2.get("estimatedMonthlyCost", "")
if cost1 != cost2:
    fail(f"idempotency check failed: estimatedMonthlyCost changed from {cost1!r} to {cost2!r} on re-fetch")

print(f"IDEMPOTENCY OK — summary stable across two fetches (photo_processed qty={qty1}, cost={cost1})")
PY
