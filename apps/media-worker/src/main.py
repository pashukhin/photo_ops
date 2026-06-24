from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"ok","service":"media-worker"}')
            return
        self.send_response(501)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(
            b'{"code":"not_implemented","message":"media processing is not implemented in this frame"}'  # noqa: E501
        )


if __name__ == "__main__":
    HTTPServer(("0.0.0.0", 3010), Handler).serve_forever()
