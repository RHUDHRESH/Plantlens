"""End-to-end: gateway.main.run in line mode (no Modbus source needed) with a pty 'Uno'."""

from __future__ import annotations

import asyncio
import json
from http.client import HTTPConnection
from pathlib import Path

from gateway.line.protocols import build_pl1
from gateway.main import GatewayRuntime, run
from gateway.settings import Settings


def _free_port() -> int:
    import socket

    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


async def test_line_mode_without_modbus_sources(pty_device, tmp_path: Path):
    tag_map = {
        "sources": [{"source_id": "uno", "protocol": "serial_line", "serial": {"baudrate": 115200}}],
        "tags": [
            {"tag": "VIB_X", "asset_id": "VIB-301", "unit": "mm/s", "quality_policy": {"stale_after_ms": 2000}},
            {"tag": "MOTOR_301_CURRENT", "asset_id": "MTR-301", "unit": "A"},
        ],
    }
    path = tmp_path / "tag_map.json"
    path.write_text(json.dumps(tag_map), encoding="utf-8")
    health_port = _free_port()
    settings = Settings(
        TAG_MAP_PATH=str(path),
        GATEWAY_SERIAL_MODE="line",
        GATEWAY_SERIAL_PORT=str(pty_device.path),
        HEALTH_PORT=health_port,
        API_BASE_URL="http://127.0.0.1:9",
        GATEWAY_LINK={"reset_policy": "hold_dtr_low"},
        GATEWAY_LINE={"column_map": {"A0": "VIB_X"}},
    )
    stop = asyncio.Event()
    task = asyncio.create_task(run(settings, stop=stop))
    try:
        for _ in range(100):
            await asyncio.sleep(0.05)
            try:
                pty_device.write("\n" + build_pl1(1, {"A0": 1.5}) + "\n")
            except OSError:
                pass
            conn = HTTPConnection("127.0.0.1", health_port, timeout=2)
            try:
                conn.request("GET", "/health")
                body = json.loads(conn.getresponse().read())
            except OSError:
                continue
            finally:
                conn.close()
            if body.get("line", {}).get("decoder", {}).get("accepted_lines", 0) >= 1:
                break
        else:
            raise AssertionError("line mode never accepted a line")
        assert body["mode"] == "line"
        assert body["links"][0]["state"] == "connected"
        assert body["uplink"]["queue_depth"] >= 1  # API is down: frames wait in order
        assert "modbus" not in body
    finally:
        stop.set()
        runtime = await asyncio.wait_for(task, 10)
    assert isinstance(runtime, GatewayRuntime)
