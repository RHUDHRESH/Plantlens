"""Recorded playback + situation audit tests."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.runtime.config_loader import load_runtime_config, reset_runtime_config_for_tests
from app.runtime.runtime_state import RuntimeState
from app.runtime.simulator.recorded_playback import (
    load_recording,
    replay_recording,
    resolve_recording_path,
)
from app.runtime.simulator.scenario_runner import ScenarioRunner
from app.runtime.simulator.simulator_gateway import SimulatorGateway
from app.runtime.situation_audit import (
    reset_situation_audit_for_tests,
    situation_audit_buffer,
)
from app.runtime.websocket_hub import WebSocketHub

REPO_ROOT = Path(__file__).resolve().parents[3]
DEMO_DIR = REPO_ROOT / "packages" / "sample-data" / "demo-microgrid"
RECORDING = DEMO_DIR / "recordings" / "motor_overload_snippet.jsonl"


@pytest.fixture(autouse=True)
def _reset():
    reset_runtime_config_for_tests()
    reset_situation_audit_for_tests()
    yield
    reset_runtime_config_for_tests()
    reset_situation_audit_for_tests()


def test_load_motor_overload_snippet():
    frames = load_recording(RECORDING)
    assert len(frames) >= 4
    assert frames[0]["tag_id"] == "MOTOR_301_CURRENT"


@pytest.mark.asyncio
async def test_replay_recording_feeds_gateway():
    config = load_runtime_config("demo", sample_data_dir=DEMO_DIR)
    state = RuntimeState()
    hub = WebSocketHub()
    runner = ScenarioRunner(
        scenarios_path=DEMO_DIR / "scenarios.json",
        tag_map_path=DEMO_DIR / "tag_map.json",
    )
    gateway = SimulatorGateway(state=state, hub=hub, runner=runner, config=config)

    result = await replay_recording(RECORDING, gateway.on_frame, realtime=False)
    await gateway._finalize_tick()  # noqa: SLF001

    assert result["frames_delivered"] >= 4
    assert "MOTOR_301_CURRENT" in state.tags
    assert state.get_tag("MOTOR_301_CURRENT") is not None


@pytest.mark.asyncio
async def test_situation_create_produces_audit_entry(monkeypatch):
    """When a situation_id appears, situation_audit_buffer records create."""
    from app.settings import get_settings

    monkeypatch.setenv("ACTIVE_PLANT_ID", "demo_microgrid_001")
    monkeypatch.setenv("SAMPLE_DATA_DIR", str(DEMO_DIR))
    get_settings.cache_clear()
    reset_runtime_config_for_tests()
    reset_situation_audit_for_tests()

    runner = ScenarioRunner(
        scenarios_path=DEMO_DIR / "scenarios.json",
        tag_map_path=DEMO_DIR / "tag_map.json",
    )
    gateway = SimulatorGateway(state=RuntimeState(), hub=WebSocketHub(), runner=runner)
    await gateway.start("scn_motor_overload", realtime=False)

    assert gateway._state.active_situations, "motor overload must create a situation"
    creates = [
        e
        for e in situation_audit_buffer.entries()
        if e.get("action") == "runtime.situation.create"
    ]
    assert creates, "situation create must produce an audit entry"
    assert creates[0]["entity_type"] == "situation"
    assert creates[0]["entity_id"] in gateway._state.active_situations
    get_settings.cache_clear()


def test_resolve_recording_path():
    path = resolve_recording_path(DEMO_DIR, "motor_overload_snippet")
    assert path == RECORDING
