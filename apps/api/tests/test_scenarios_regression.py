"""Full pipeline scenario regression harness."""

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


@pytest.mark.parametrize(
    "scenario_id",
    [
        "scn_motor_overload",
        "scn_pv_generation_loss",
        "scn_sensor_stale_no_root",
        "scn_unapproved_edge_ignored",
        "scn_gateway_dropout",
        "scn_recovery_clear",
        "scn_downstream_only_no_root",
        "scn_temporal_violation_rejected",
    ],
)
def test_scenario_regression_matrix(gateway: SimulatorGateway, scenario_id: str):
    state = asyncio.run(_run(gateway, scenario_id))
    spec = _scenario(scenario_id)

    if spec.get("expected_situation"):
        assert len(state.active_situations) == 1
        situation = next(iter(state.active_situations.values()))
        assert situation["situation_type"] == spec["expected_situation"]
        assert situation["root_asset_id"] == spec["expected_root_cause"]
        assert state.latest_evidence_packet is not None
        assert state.latest_calm_card is not None
        assert state.latest_evidence_packet["root_asset_id"] == spec["expected_root_cause"]
    else:
        assert not state.active_situations
        assert state.latest_evidence_packet is None

    if spec.get("expected_alarms") is not None:
        for alarm_id in spec["expected_alarms"]:
            assert alarm_id in state.active_alarms


def test_motor_overload_evidence_chain_first_signal(gateway: SimulatorGateway):
    state = asyncio.run(_run(gateway, "scn_motor_overload"))
    packet = state.latest_evidence_packet
    assert packet is not None
    chain = packet["evidence_chain"]
    assert chain[0]["alarm_id"] == "MOTOR_CURRENT_HIGH"
    assert chain[0]["role"] == "first_signal"


def test_temporal_violation_rejects_motor_candidate(gateway: SimulatorGateway):
    state = asyncio.run(_run(gateway, "scn_temporal_violation_rejected"))
    assert not state.active_situations
    assert state.latest_evidence_packet is None
    assert "MOTOR_CURRENT_HIGH" in state.active_alarms
    assert "DC_BUS_LOW" in state.active_alarms