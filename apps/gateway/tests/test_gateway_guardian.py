"""Gateway guardian — R3/R7/R10 red-team."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

from datetime import UTC, datetime

from gateway.tag_frame import TagFrame

GATEWAY_ROOT = Path(__file__).resolve().parents[1]

FORBIDDEN_PREFIXES = (
    "app.runtime",
    "app.agents",
    "openai",
    "langchain",
)


def test_gateway_frame_validates_against_contract_shape():
    frame = TagFrame(
        tag_id="BUS_101_V",
        asset_id="BUS-101",
        value=48.0,
        unit="V",
        quality="GOOD",
        timestamp=datetime(2026, 6, 19, 12, 0, 0, tzinfo=UTC),
        source="modbus_rtu",
        seq=1,
        gateway_id="gw-test",
    )
    dumped = frame.model_dump(mode="json")
    assert dumped["quality"] in {"GOOD", "STALE", "BAD"}
    assert dumped["tag_id"] == "BUS_101_V"


def test_gateway_imports_avoid_runtime_and_llm():
    script = (
        "import sys; "
        "import gateway.main; "
        "import gateway.modbus_poller; "
        "import gateway.publish; "
        f"prefixes = {FORBIDDEN_PREFIXES!r}; "
        "mods = sorted(m for m in sys.modules if any(m.startswith(p) for p in prefixes)); "
        "print(mods)"
    )
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=GATEWAY_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "[]"


def test_plc_bridge_has_no_coil_writes():
    from gateway.plc_bridge.bridge_service import PlcBridgeService

    bridge = PlcBridgeService()
    assert "coil" in bridge.FORBIDDEN_REGISTER_TYPES