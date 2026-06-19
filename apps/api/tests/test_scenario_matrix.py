"""Scenario regression matrix — deterministic runtime assertions."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

from app.runtime.config_loader import reset_runtime_config_for_tests
from app.runtime.runtime_state import RuntimeState
from app.runtime.simulator.scenario_runner import ScenarioRunner
from app.runtime.simulator.simulator_gateway import SimulatorGateway, reset_simulator_gateway_for_tests
from app.runtime.websocket_hub import WebSocketHub

REPO_ROOT = Path(__file__).resolve().parents[3]
DEMO_DIR = REPO_ROOT / "packages" / "sample-data" / "demo-microgrid"
SCENARIOS = json.loads((DEMO_DIR / "scenarios.json").read_text(encoding="utf-8"))


@pytest.fixture(autouse=True)
def reset_singletons() -> None:
    reset_runtime_config_for_tests()
    reset_simulator_gateway_for_tests()
    yield
    reset_runtime_config_for_tests()
    reset_simulator_gateway_for_tests()


@pytest.fixture
def gateway() -> SimulatorGateway:
    runner = ScenarioRunner(
        scenarios_path=DEMO_DIR / "scenarios.json",
        tag_map_path=DEMO_DIR / "tag_map.json",
    )
    return SimulatorGateway(state=RuntimeState(), hub=WebSocketHub(), runner=runner)


async def _run(gateway: SimulatorGateway, scenario_id: str) -> RuntimeState:
    await gateway.start(scenario_id, realtime=False)
    return gateway._state


def _scenario(scenario_id: str) -> dict:
    return next(s for s in SCENARIOS["scenarios"] if s["id"] == scenario_id)


def test_pv_generation_loss_root_is_pv(gateway: SimulatorGateway):
    state = asyncio.run(_run(gateway, "scn_pv_generation_loss"))
    spec = _scenario("scn_pv_generation_loss")
    assert len(state.active_situations) == 1
    situation = next(iter(state.active_situations.values()))
    assert situation["situation_type"] == spec["expected_situation"]
    assert situation["root_asset_id"] == spec["expected_root_cause"]


def test_gateway_dropout_no_root_cause(gateway: SimulatorGateway):
    state = asyncio.run(_run(gateway, "scn_gateway_dropout"))
    assert not state.active_situations
    assert state.asset_status.get("MTR-301") == "sensor_bad"
    assert state.asset_status.get("BUS-101") == "sensor_bad"


def test_unapproved_edge_keeps_motor_root(gateway: SimulatorGateway):
    state = asyncio.run(_run(gateway, "scn_unapproved_edge_ignored"))
    situation = next(iter(state.active_situations.values()))
    assert situation["root_asset_id"] == "MTR-301"
    assert situation["situation_type"] == "MOTOR_MECHANICAL_OVERLOAD"


def test_recovery_clears_situation_latches_ack_alarm(gateway: SimulatorGateway):
    state = asyncio.run(_run(gateway, "scn_recovery_clear"))
    spec = _scenario("scn_recovery_clear")
    assert not state.active_situations
    assert set(spec["expected_alarms"]).issubset(state.active_alarms.keys())
    assert "MOTOR_CURRENT_HIGH" not in state.active_alarms
    assert "INV_UNDERVOLTAGE" not in state.active_alarms