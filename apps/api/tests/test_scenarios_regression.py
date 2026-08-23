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
def reset_singletons(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.settings import get_settings

    monkeypatch.setenv("ACTIVE_PLANT_ID", "demo_microgrid_001")
    monkeypatch.setenv("SAMPLE_DATA_DIR", str(DEMO_DIR))
    get_settings.cache_clear()
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


def test_scenarios_regression_stale_raises_dq_not_process_root(
    gateway: SimulatorGateway,
):
    state = asyncio.run(_run(gateway, "scn_sensor_stale_no_root"))
    assert "DQ_MOTOR_301_CURRENT_STALE" in state.active_alarms
    assert not state.active_situations
    assert state.latest_evidence_packet is None
    assert state.latest_calm_card is None
    process = [
        a
        for a in state.active_alarms.values()
        if a.get("alarm_class", "process") != "data_quality"
    ]
    assert process == []


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


def test_motor_overload_fault_matrix_overlay(gateway: SimulatorGateway):
    """Matrix scores are an overlay; DAG situation root remains authority."""
    state = asyncio.run(_run(gateway, "scn_motor_overload"))
    spec = _scenario("scn_motor_overload")

    assert len(state.active_situations) == 1
    situation = next(iter(state.active_situations.values()))
    assert situation["root_asset_id"] == spec["expected_root_cause"]

    packet = state.latest_evidence_packet
    assert packet is not None
    assert packet["root_asset_id"] == spec["expected_root_cause"]

    scores = packet.get("fault_matrix_scores") or []
    assert scores, "expected fault_matrix_scores on evidence packet"
    top = scores[0]
    assert top["fault_id"] == "F_MOTOR_MECHANICAL_OVERLOAD"
    assert "overload" in top["fault_name"].lower()
    assert top["coverage"] > 0
    assert top["asset_id"] == "MTR-301"
    assert top["contradicted"] is False

    card = state.latest_calm_card
    assert card is not None
    # Optional calm-card matrix overlay (parent may add these fields later).
    matrix_overlay = card.get("fault_matrix_top") or card.get("fault_matrix_scores")
    if matrix_overlay is not None:
        if isinstance(matrix_overlay, list):
            assert matrix_overlay
            overlay_top = matrix_overlay[0]
        else:
            overlay_top = matrix_overlay
        assert overlay_top["fault_id"] == "F_MOTOR_MECHANICAL_OVERLOAD"
        assert overlay_top["coverage"] > 0


def test_temporal_violation_rejects_motor_candidate(gateway: SimulatorGateway):
    state = asyncio.run(_run(gateway, "scn_temporal_violation_rejected"))
    assert not state.active_situations
    assert state.latest_evidence_packet is None
    assert "MOTOR_CURRENT_HIGH" in state.active_alarms
    assert "DC_BUS_LOW" in state.active_alarms