"""Gateway health and commissioning endpoint tests.

The original test started a non-daemon thread that called ``handle_request()`` twice for a single
request, so pytest hung forever at exit. The server now runs ``serve_forever`` on a daemon thread
(ThreadingHTTPServer with daemon request threads) and every test shuts it down and closes it.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from http.client import HTTPConnection
from typing import Any

import pytest

from gateway.health import start_health_server
from gateway.modbus_poller import PollDiagnostics
from gateway.transport import serial_link


def _get(server: Any, path: str) -> tuple[int, dict[str, Any]]:
    port = server.server_address[1]
    conn = HTTPConnection("127.0.0.1", port, timeout=3)
    try:
        conn.request("GET", path)
        response = conn.getresponse()
        return response.status, json.loads(response.read().decode("utf-8") or "{}")
    finally:
        conn.close()


@pytest.fixture
def server() -> Iterator[Any]:
    srv = start_health_server(0, PollDiagnostics(error_count=2), host="127.0.0.1")
    yield srv
    srv.shutdown()
    srv.server_close()


def test_commission_ports_endpoint(server):
    status, body = _get(server, "/commission/ports")
    assert status == 200
    assert isinstance(body["ports"], list)


def test_health_keeps_legacy_keys(server):
    status, body = _get(server, "/health")
    assert status == 200
    assert body["status"] == "ok"
    assert body["error_count"] == 2
    assert {"last_good_read_ts", "crc_failures", "reconnect_count", "stale_tag_count"} <= set(body)


def test_probe_refuses_port_held_by_link(server, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setitem(serial_link._HELD, serial_link._key("/dev/ttyPLANTLENS_HELD"), "line")
    status, body = _get(server, "/commission/probe?port=/dev/ttyPLANTLENS_HELD&baudrate=9600")
    assert status == 409
    assert body["available"] is False
    assert "held open" in body["detail"]


def test_probe_missing_port_reports_unavailable(server):
    status, body = _get(server, "/commission/probe?port=/dev/ttyPLANTLENS_MISSING&baudrate=9600")
    assert status == 200
    assert body["available"] is False


def test_status_fn_feeds_health():
    srv = start_health_server(0, status_fn=lambda: {"uplink": {"queue_depth": 3}}, host="127.0.0.1")
    try:
        status, body = _get(srv, "/health")
    finally:
        srv.shutdown()
        srv.server_close()
    assert status == 200 and body["uplink"]["queue_depth"] == 3
