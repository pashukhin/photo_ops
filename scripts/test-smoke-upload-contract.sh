#!/usr/bin/env sh
set -eu

TMP_DIR="${TMPDIR:-/tmp}/photoops-smoke-contract"
PORT_FILE="$TMP_DIR/port"
LOG_FILE="$TMP_DIR/server.log"
OUT_FILE="$TMP_DIR/smoke.out"

rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"

python3 - <<'PY' "$PORT_FILE" > "$LOG_FILE" 2>&1 &
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import sys

photo_id = "018f0000-0000-7000-8000-000000000001"
uploaded = False

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        global uploaded
        if self.path == "/photos/upload-intents":
            length = int(self.headers.get("content-length", "0"))
            body = json.loads(self.rfile.read(length))
            if body.get("contentType") != "image/jpeg":
                self.send_response(400)
                self.end_headers()
                return
            self._json({
                "photoId": photo_id,
                "uploadUrl": f"http://127.0.0.1:{self.server.server_port}/upload/{photo_id}",
                "objectKey": "originals/smoke.jpg",
            })
            return
        if self.path == f"/photos/{photo_id}/complete-upload":
            uploaded = True
            self._json({"photoId": photo_id, "status": "uploaded"})
            return
        self.send_error(404)

    def do_PUT(self):
        if self.path == f"/upload/{photo_id}":
            length = int(self.headers.get("content-length", "0"))
            data = self.rfile.read(length)
            if not data.startswith(b"\xff\xd8"):
                self.send_response(415)
                self.end_headers()
                return
            self.send_response(200)
            self.end_headers()
            return
        self.send_error(404)

    def do_GET(self):
        if self.path == "/photos":
            status = "uploaded" if uploaded else "pending_upload"
            self._json({"photos": [{"id": photo_id, "status": status, "filename": "smoke.jpg"}]})
            return
        self.send_error(404)

    def log_message(self, format, *args):
        return

    def _json(self, payload):
        body = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
with open(sys.argv[1], "w", encoding="utf-8") as handle:
    handle.write(str(server.server_port))
server.serve_forever()
PY
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT INT TERM

for _ in $(seq 1 50); do
  if [ -s "$PORT_FILE" ]; then
    break
  fi
  sleep 0.1
done

if [ ! -s "$PORT_FILE" ]; then
  cat "$LOG_FILE"
  exit 1
fi

PORT="$(cat "$PORT_FILE")"
API_BASE_URL="http://127.0.0.1:$PORT" scripts/smoke-upload.sh > "$OUT_FILE"
grep -q "smoke upload ok" "$OUT_FILE"
