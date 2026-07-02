#!/usr/bin/env bash
# Smoke test for photo clustering (session 013).
# Preconditions: `make dev` + `make migrate` already running.
# Mirror structure: scripts/smoke-usage.sh
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:3001}"
# Reuse the media-worker venv (Pillow + piexif) to synthesize EXIF JPEGs.
VENV_PYTHON="${VENV_PYTHON:-apps/media-worker/.venv/bin/python}"
TMP="${TMPDIR:-/tmp}/photoops-cluster-smoke"
COOKIE_PATH="$TMP/session.cookie"
RESULT_PATH="$TMP/result.json"

mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT
STAMP="$(date +%s)"

# ---------------------------------------------------------------------------
# 1. Sign up a unique user
# ---------------------------------------------------------------------------
curl -fsS -c "$COOKIE_PATH" -H 'content-type: application/json' \
  -d "{\"email\":\"cluster-smoke-$STAMP@example.com\",\"password\":\"secret123\",\"displayName\":\"Cluster Smoke\"}" \
  "$API_BASE_URL/auth/signup" >/dev/null

# ---------------------------------------------------------------------------
# gen_jpeg <out> <dt_original|""> <make> <model>   — synthesize an EXIF JPEG
# upload_photo <dt_original|""> <make> <model>     — full upload flow, echo photo_id
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
# 2. Fixture: Canon burst (day 1) + Canon (day 3) + injected Samsung (day 1) +
#    a Canon photo with NO capture time (→ not_clusterable).
# ---------------------------------------------------------------------------
CANON_A1="$(upload_photo "2024:06:15 10:00:00" "Canon" "EOS R5")"
CANON_A2="$(upload_photo "2024:06:15 10:05:00" "Canon" "EOS R5")"
CANON_B1="$(upload_photo "2024:06:17 14:00:00" "Canon" "EOS R5")"
INJECT="$(upload_photo "2024:06:15 10:02:00" "Samsung" "SM-G991B")"
NOTIME="$(upload_photo "" "Canon" "EOS R5")"
echo "[smoke-cluster] canon=$CANON_A1,$CANON_A2,$CANON_B1 inject=$INJECT notime=$NOTIME" >&2

# ---------------------------------------------------------------------------
# 3. Wait for all photos to reach status=ready
# ---------------------------------------------------------------------------
for pid in "$CANON_A1" "$CANON_A2" "$CANON_B1" "$INJECT" "$NOTIME"; do
  DEADLINE=$(( $(date +%s) + 60 ))
  while true; do
    st="$(curl -fsS -b "$COOKIE_PATH" "$API_BASE_URL/photos/$pid" | jq -r '.status')"
    [ "$st" = "ready" ] && break
    if [ "$st" = "failed" ] || [ "$(date +%s)" -ge "$DEADLINE" ]; then
      echo "ERROR: photo $pid status=$st (expected ready)" >&2
      echo "HINT: media pipeline issue — check \`make logs\` and escalate" >&2
      exit 1
    fi
    sleep 2
  done
done

# ---------------------------------------------------------------------------
# 4. The method registry lists time_only
# ---------------------------------------------------------------------------
curl -fsS -b "$COOKIE_PATH" "$API_BASE_URL/v1/clustering-methods" \
  | jq -e '.methods | map(.id) | index("time_only")' >/dev/null

# ---------------------------------------------------------------------------
# 5. Generate + poll until ready
# ---------------------------------------------------------------------------
RESULT_ID="$(curl -fsS -b "$COOKIE_PATH" -H 'content-type: application/json' \
  -d '{"scope":"all","method":"time_only"}' \
  "$API_BASE_URL/v1/clusters/generate" | jq -r '.resultId')"
echo "[smoke-cluster] result_id=$RESULT_ID" >&2

DEADLINE=$(( $(date +%s) + 60 ))
while true; do
  curl -fsS -b "$COOKIE_PATH" "$API_BASE_URL/v1/clustering-results/$RESULT_ID" > "$RESULT_PATH"
  st="$(jq -r '.status' "$RESULT_PATH")"
  [ "$st" = "ready" ] && break
  if [ "$st" = "failed" ] || [ "$(date +%s)" -ge "$DEADLINE" ]; then
    echo "ERROR: clustering result status=$st (expected ready). Response:" >&2
    cat "$RESULT_PATH" >&2
    echo "HINT: check \`make logs-svc svc=cluster-worker\` / cluster-service" >&2
    exit 1
  fi
  sleep 2
done

# ---------------------------------------------------------------------------
# 6. Assert the tree: device segmentation (anti-injection) + not_clusterable
# ---------------------------------------------------------------------------
"$VENV_PYTHON" - "$RESULT_PATH" "$CANON_A1" "$CANON_A2" "$CANON_B1" "$INJECT" "$NOTIME" <<'PY'
import json, sys
res = json.load(open(sys.argv[1]))
canon_a1, canon_a2, canon_b1, inject, notime = sys.argv[2:7]

def fail(msg):
    print(f"ASSERTION FAILED: {msg}", file=sys.stderr)
    print(json.dumps(res, indent=2), file=sys.stderr)
    sys.exit(1)

def photos(node):
    acc = set(node.get("items", []))
    for c in node.get("children", []):
        acc |= photos(c)
    return acc

if res.get("photoCount") != 5:
    fail(f"expected photoCount=5, got {res.get('photoCount')}")
root = res.get("root")
if not root or root.get("kind") != "root":
    fail("missing root node")

segments = {c.get("segmentLabel"): photos(c) for c in root["children"] if c.get("kind") == "segment"}
notclust = [c for c in root["children"] if c.get("kind") == "not_clusterable"]

if "Canon EOS R5" not in segments:
    fail(f"no 'Canon EOS R5' segment; labels={list(segments)}")
if "Samsung SM-G991B" not in segments:
    fail(f"no 'Samsung SM-G991B' segment; labels={list(segments)}")

canon_photos = segments["Canon EOS R5"]
if canon_photos != {canon_a1, canon_a2, canon_b1}:
    fail(f"Canon segment photos {canon_photos} != {{{canon_a1},{canon_a2},{canon_b1}}}")
if inject not in segments["Samsung SM-G991B"]:
    fail("injected photo not in the Samsung segment")
if inject in canon_photos:
    fail("injected photo leaked into the Canon segment (anti-injection failed)")

if not notclust or notime not in photos(notclust[0]):
    fail("no-time photo not in a not_clusterable node")

print("SMOKE CLUSTER OK — device segmentation + not_clusterable verified")
PY

# ---------------------------------------------------------------------------
# 7. Consumption: the run surfaces a cluster_generated line in the usage summary
# ---------------------------------------------------------------------------
DEADLINE=$(( $(date +%s) + 30 ))
while true; do
  if curl -fsS -b "$COOKIE_PATH" "$API_BASE_URL/v1/usage/summary" \
      | jq -e '.lines | map(.eventType) | index("cluster_generated")' >/dev/null 2>&1; then
    echo "[smoke-cluster] consumption event recorded" >&2
    break
  fi
  if [ "$(date +%s)" -ge "$DEADLINE" ]; then
    echo "ERROR: no cluster_generated line in usage summary (consumption not recorded)" >&2
    exit 1
  fi
  sleep 2
done

echo "SMOKE CLUSTER OK"
