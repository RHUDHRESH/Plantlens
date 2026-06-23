"""Gateway health commission endpoint tests."""

from __future__ import annotations

import json
from http.client import HTTPConnection
from threading import Thread

from gateway.health import start_health_server
from gateway.modbus_poller import PollDiagnostics


def test_commission_ports_endpoint():
    server = start_health_server(0, PollDiagnostics())
    host, port = server.server_address

    def _serve():
        server.handle_request()
        server.handle_request()

    thread = Thread(target=_serve)
    thread.start()

    conn = HTTPConnection("127.0.0.1", port, timeout=2)
    conn.request("GET", "/commission/ports")
    response = conn.getresponse()
    body = json.loads(response.read().decode("utf-8"))

    assert response.status == 200
    assert "ports" in body
    assert isinstance(body["ports"], list)

    server.shutdown()
    thread.join(timeout=2)