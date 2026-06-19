"""Gateway health HTTP endpoint."""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread
from typing import Any

from gateway.modbus_poller import PollDiagnostics


class _HealthHandler(BaseHTTPRequestHandler):
    diagnostics: PollDiagnostics | None = None

    def do_GET(self) -> None:
        if self.path != "/health":
            self.send_response(404)
            self.end_headers()
            return
        diag = self.diagnostics or PollDiagnostics()
        body: dict[str, Any] = {
            "status": "ok",
            "last_good_read_ts": (
                diag.last_good_read_ts.isoformat().replace("+00:00", "Z")
                if diag.last_good_read_ts
                else None
            ),
            "error_count": diag.error_count,
            "crc_failures": diag.crc_failures,
            "reconnect_count": diag.reconnect_count,
            "stale_tag_count": diag.stale_tag_count,
        }
        payload = json.dumps(body).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format: str, *args: Any) -> None:
        return


def start_health_server(port: int, diagnostics: PollDiagnostics) -> HTTPServer:
    handler = type("BoundHealthHandler", (_HealthHandler,), {"diagnostics": diagnostics})
    server = HTTPServer(("0.0.0.0", port), handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server