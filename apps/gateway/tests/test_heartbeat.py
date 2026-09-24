"""Gateway heartbeat: payload shape, auth header, backoff, never raising (httpx MockTransport)."""

from __future__ import annotations

import asyncio
import json

import httpx
from gateway.heartbeat import Heartbeat, local_ips, summarize

MODBUS_SNAPSHOT = {
    "mode": "modbus",
    "frames_published": 40,
    "stale_tag_count": 2,
    "modbus": {
        "devices": [
            {"requests": 10, "timeouts": 1, "crc_errors": 2},
            {"requests": 5, "timeouts": 0, "crc_errors": 0},
        ]
    },
    "links": [
        {
            "name": "rtu:bus1",
            "state": "connected",
            "port": "COM5",
            "reconnect_count": 3,
            "last_error": None,
            "selector": "auto",
            "identity": {
                "device": "COM5",
                "vid": "1A86",
                "pid": "7523",
                "serial_number": None,
                "description": "USB-SERIAL CH340 (COM5)",
                "adapter": "CH340",
            },
        }
    ],
    "uplink": {"queue_depth": 3, "dropped": 1, "quarantined": 0, "last_status": 200, "last_error": None},
}

LINE_SNAPSHOT = {
    "mode": "line",
    "line": {"decoder": {"accepted_lines": 7, "rejected_lines": 1, "checksum_failures": 1}},
    "links": [{"name": "line", "state": "reconnecting", "port": None, "identity": None, "last_error": "unplugged"}],
}


def _recorder(statuses: list[int]):
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        status = statuses.pop(0) if statuses else 200
        return httpx.Response(status, json={"status": "ok"})

    return seen, httpx.MockTransport(handler)


def test_summarize_modbus_snapshot():
    body = summarize(MODBUS_SNAPSHOT)
    assert body["mode"] == "modbus"
    [link] = body["links"]
    assert link == {
        "name": "rtu:bus1",
        "state": "connected",
        "device": "COM5",
        "selector": "auto",
        "vid": "1A86",
        "pid": "7523",
        "serial_number": None,
        "description": "USB-SERIAL CH340 (COM5)",
        "adapter": "CH340",
        "reconnect_count": 3,
        "last_error": None,
    }
    assert body["counters"] == {
        "frames_published": 40,
        "stale_tags": 2,
        "modbus_requests": 15,
        "modbus_timeouts": 1,
        "modbus_crc_errors": 2,
    }
    assert body["uplink"]["queue_depth"] == 3 and body["uplink"]["dropped"] == 1


def test_summarize_line_snapshot_without_identity():
    body = summarize(LINE_SNAPSHOT)
    assert body["links"][0]["device"] is None
    assert body["links"][0]["state"] == "reconnecting"
    assert body["links"][0]["last_error"] == "unplugged"
    assert body["counters"]["line_accepted"] == 7
    assert body["counters"]["line_checksum_failures"] == 1
    assert "modbus_requests" not in body["counters"]


async def test_send_once_posts_with_ingest_token():
    seen, transport = _recorder([])
    hb = Heartbeat(
        api_base="http://api.test:8000/",
        token="tok",
        gateway_id="gw-bench-1",
        snapshot_fn=lambda: MODBUS_SNAPSHOT,
        health_port=9101,
        transport=transport,
        hostname="BENCH-PC",
    )
    try:
        assert await hb.send_once() is True
    finally:
        await hb.close()
    [request] = seen
    assert str(request.url) == "http://api.test:8000/api/gateways/heartbeat"
    assert request.headers["Authorization"] == "Bearer tok"
    body = json.loads(request.content)
    assert body["gateway_id"] == "gw-bench-1"
    assert body["hostname"] == "BENCH-PC"
    assert body["health_port"] == 9101
    assert body["os"] and body["version"] and body["started_at"].endswith("Z")
    assert isinstance(body["ips"], list)
    assert body["links"][0]["device"] == "COM5"
    assert body["counters"]["frames_per_s"] == 0.0
    assert hb.sent == 1 and hb.last_status == 200


async def test_frames_per_second_from_counter_delta(monkeypatch):
    counter = {"n": 0}
    clock = {"t": 100.0}
    monkeypatch.setattr("gateway.heartbeat.time.monotonic", lambda: clock["t"])
    hb = Heartbeat(api_base="http://x", token="t", gateway_id="g", snapshot_fn=lambda: {"frames_published": counter["n"]})
    assert hb.build_payload()["counters"]["frames_per_s"] == 0.0
    counter["n"] = 50
    clock["t"] = 105.0
    assert hb.build_payload()["counters"]["frames_per_s"] == 10.0


async def test_backs_off_when_api_down_and_recovers():
    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    hb = Heartbeat(
        api_base="http://api.test",
        token="t",
        gateway_id="g",
        snapshot_fn=dict,
        interval_s=5,
        backoff_max_s=30,
        transport=httpx.MockTransport(down),
    )
    try:
        delays = []
        for _ in range(4):
            assert await hb.send_once() is False
            delays.append(hb.delay_s)
        assert delays == [10, 20, 30, 30]
        assert hb.failures == 4 and "ConnectError" in (hb.last_error or "")
    finally:
        await hb.close()

    _, ok = _recorder([])
    hb._transport = ok
    try:
        assert await hb.send_once() is True
        assert hb.delay_s == 5 and hb.last_error is None
    finally:
        await hb.close()


async def test_http_error_and_broken_snapshot_never_raise():
    _, transport = _recorder([401])
    hb = Heartbeat(api_base="http://api.test", token="bad", gateway_id="g", snapshot_fn=dict, transport=transport)
    try:
        assert await hb.send_once() is False
        assert hb.last_status == 401 and hb.last_error.startswith("HTTP 401")
    finally:
        await hb.close()

    def broken() -> dict:
        raise RuntimeError("snapshot exploded")

    hb2 = Heartbeat(api_base="http://api.test", token="t", gateway_id="g", snapshot_fn=broken, transport=transport)
    try:
        assert await hb2.send_once() is False
        assert "snapshot exploded" in (hb2.last_error or "")
    finally:
        await hb2.close()


async def test_background_task_runs_and_closes():
    seen, transport = _recorder([])
    hb = Heartbeat(
        api_base="http://api.test", token="t", gateway_id="g", snapshot_fn=dict, interval_s=0.02, transport=transport
    )
    await hb.start()
    for _ in range(100):
        if len(seen) >= 2:
            break
        await asyncio.sleep(0.01)
    await hb.close()
    assert len(seen) >= 2
    count = len(seen)
    await asyncio.sleep(0.05)
    assert len(seen) == count


def test_local_ips_never_raises_and_skips_loopback():
    ips = local_ips("http://127.0.0.1:8000")
    assert all(not ip.startswith("127.") for ip in ips)
    assert local_ips("not a url") is not None
