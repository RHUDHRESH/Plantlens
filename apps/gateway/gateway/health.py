"""Gateway health and commissioning HTTP endpoints."""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread
from typing import Any
from urllib.parse import parse_qs, urlparse

from gateway.diagnostics import list_serial_ports, probe_port
from gateway.modbus_poller import PollDiagnostics


class _HealthHandler(BaseHTTPRequestHandler):
    diagnostics: PollDiagnostics | None = None

    def _write_json(self, status: int, body: dict[str, Any]) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/health":
            diag = self.diagnostics or PollDiagnostics()
            self._write_json(
                200,
                {
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
                },
            )
            return
        if path == "/commission/ports":
            self._write_json(200, {"ports": list_serial_ports()})
            return
        if path == "/commission/probe":
            query = parse_qs(urlparse(self.path).query)
            port = (query.get("port") or ["COM3"])[0]
            baudrate = int((query.get("baudrate") or ["9600"])[0])
            probe = probe_port(port, baudrate=baudrate)
            self._write_json(
                200,
                {
                    "port": probe.port,
                    "available": probe.available,
                    "detail": probe.detail,
                },
            )
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, format: str, *args: Any) -> None:
        return


def start_health_server(port: int, diagnostics: PollDiagnostics) -> HTTPServer:
    handler = type("BoundHealthHandler", (_HealthHandler,), {"diagnostics": diagnostics})
    server = HTTPServer(("0.0.0.0", port), handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server