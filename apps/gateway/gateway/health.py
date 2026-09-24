"""Gateway health and commissioning HTTP endpoints.

Runs a ``ThreadingHTTPServer`` with daemon request threads, so a slow ``/commission/probe``
never blocks ``/health``. ``/commission/probe`` refuses (HTTP 409) any port currently held open by
a gateway link, instead of opening a live port a second time.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from typing import Any
from urllib.parse import parse_qs, urlparse

from gateway.diagnostics import list_serial_ports, probe_port
from gateway.transport.serial_link import is_port_held

StatusFn = Callable[[], dict[str, Any]]


def _legacy_poll_body(diag: Any) -> dict[str, Any]:
    ts = getattr(diag, "last_good_read_ts", None)
    return {
        "last_good_read_ts": ts.isoformat().replace("+00:00", "Z") if ts else None,
        "error_count": getattr(diag, "error_count", 0),
        "crc_failures": getattr(diag, "crc_failures", 0),
        "reconnect_count": getattr(diag, "reconnect_count", 0),
        "stale_tag_count": getattr(diag, "stale_tag_count", 0),
    }


class _HealthHandler(BaseHTTPRequestHandler):
    diagnostics: Any = None
    status_fn: StatusFn | None = None

    def _write_json(self, status: int, body: dict[str, Any]) -> None:
        payload = json.dumps(body, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:  # noqa: N802 (http.server API)
        url = urlparse(self.path)
        if url.path == "/health":
            body: dict[str, Any] = {"status": "ok"}
            if self.status_fn is not None:
                try:
                    body.update(self.status_fn())
                except Exception as exc:
                    body = {"status": "degraded", "detail": f"{type(exc).__name__}: {exc}"}
            else:
                body.update(_legacy_poll_body(self.diagnostics))
            self._write_json(200, body)
            return
        if url.path == "/commission/ports":
            self._write_json(200, {"ports": list_serial_ports()})
            return
        if url.path == "/commission/probe":
            query = parse_qs(url.query)
            port = (query.get("port") or [""])[0]
            if not port:
                self._write_json(400, {"port": port, "available": False, "detail": "port query parameter required"})
                return
            try:
                baudrate = int((query.get("baudrate") or ["9600"])[0])
            except ValueError:
                self._write_json(400, {"port": port, "available": False, "detail": "invalid baudrate"})
                return
            owner = is_port_held(port)
            if owner is not None:
                self._write_json(
                    409,
                    {
                        "port": port,
                        "available": False,
                        "detail": f"port is held open by gateway link {owner!r}; not probing a live port",
                    },
                )
                return
            probe = probe_port(port, baudrate=baudrate)
            self._write_json(200, {"port": probe.port, "available": probe.available, "detail": probe.detail})
            return
        self.send_response(404)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        return


class HealthServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def start_health_server(
    port: int,
    diagnostics: Any = None,
    *,
    status_fn: StatusFn | None = None,
    host: str = "0.0.0.0",
) -> HealthServer:
    """Start the health server on a daemon thread. Stop with ``shutdown()`` + ``server_close()``."""
    handler = type(
        "BoundHealthHandler",
        (_HealthHandler,),
        {"diagnostics": diagnostics, "status_fn": staticmethod(status_fn) if status_fn else None},
    )
    server = HealthServer((host, port), handler)
    thread = Thread(target=server.serve_forever, name="gateway-health", daemon=True)
    thread.start()
    return server
