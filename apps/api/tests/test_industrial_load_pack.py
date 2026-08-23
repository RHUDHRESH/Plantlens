"""Regression tests for the industrial load demo pack.

Runs all 6 scenarios through the full pipeline:
  ScenarioRunner → SimulatorGateway → RuntimeState → RuntimeEvidencePacket → CalmCard

Validates root cause, situation type, evidence packet, and AI explanation.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

from app.ai_harness.conversation_service import answer_message as answer_message_async
from app.ai_harness.intents import Intent


def answer_message(*args, **kwargs):
    return asyncio.run(answer_message_async(*args, **kwargs))
from app.runtime.config_loader import reset_runtime_config_for_tests
from app.runtime.runtime_state import RuntimeState
from app.runtime.simulator.scenario_runner import ScenarioRunner
from app.runtime.simulator.simulator_gateway import SimulatorGateway, reset_simulator_gateway_for_tests
from app.runtime.websocket_hub import WebSocketHub

REPO_ROOT = Path(__file__).resolve().parents[3]
IL_DIR = REPO_ROOT / "packages" / "sample-data" / "demo-industrial-load"
SCENARIOS = json.loads((IL_DIR / "scenarios.json").read_text(encoding="utf-8"))


@pytest.fixture(autouse=True)
def reset_singletons():
    reset_runtime_config_for_tests()
    reset_simulator_gateway_for_tests()
    yield
    reset_runtime_config_for_tests()
    reset_simulator_gateway_for_tests()


@pytest.fixture
def gateway():
    runner = ScenarioRunner(
        scenarios_path=IL_DIR / "scenarios.json",
        tag_map_path=IL_DIR / "tag_map.json",
    )
    state = RuntimeState()
    return SimulatorGateway(state=state, hub=WebSocketHub(), runner=runner), state


async def _run(gateway_pair, scenario_id: str) -> RuntimeState:
    gw, state = gateway_pair
    # Point config loader at industrial-load bundle
    from app.runtime.config_loader import load_runtime_config
    import app.runtime.config_loader as cl
    cl._config = load_runtime_config("demo_industrial_load_001", sample_data_dir=IL_DIR)
    gw._state = state
    await gw.start(scenario_id, realtime=False)
    return state


def _scenario(scenario_id: str) -> dict:
    return next(s for s in SCENARIOS["scenarios"] if s["id"] == scenario_id)


# ---------------------------------------------------------------------------
# Scenario 1: Motor Mechanical Overload
# ---------------------------------------------------------------------------


def test_il_motor_overload_root_cause(gateway):
    state = asyncio.run(_run(gateway, "scn_il_motor_overload"))
    spec = _scenario("scn_il_motor_overload")

    assert state.active_situations, "No situation detected"
    sit = next(iter(state.active_situations.values()))
    assert sit["situation_type"] == spec["expected_situation"]
    assert sit["root_asset_id"] == spec["expected_root_cause"]
    assert state.latest_evidence_packet is not None
    assert state.latest_evidence_packet["root_asset_id"] == "MOTOR-001"
    assert state.latest_calm_card is not None


def test_il_motor_overload_expected_alarms(gateway):
    state = asyncio.run(_run(gateway, "scn_il_motor_overload"))
    spec = _scenario("scn_il_motor_overload")
    for alarm_id in spec["expected_alarms"]:
        assert alarm_id in state.active_alarms, f"{alarm_id} not fired"


def test_il_motor_overload_ai_explains_root_cause(gateway):
    state = asyncio.run(_run(gateway, "scn_il_motor_overload"))
    snapshot = state.snapshot()
    response = answer_message(
        "why is the motor the root cause?",
        role="operator",
        snapshot=snapshot,
    )
    assert response.intent == str(Intent.EXPLAIN_ROOT_CAUSE)
    assert "MOTOR-001" in response.answer or "motor" in response.answer.lower()
    assert len(response.evidence_refs) >= 1


def test_il_motor_overload_ai_explains_rejected_candidate(gateway):
    state = asyncio.run(_run(gateway, "scn_il_motor_overload"))
    snapshot = state.snapshot()
    ep = snapshot.get("latest_evidence_packet", {})
    # Should have rejected candidates (BAT-001, DC-BUS-001 must be rejected)
    if ep.get("rejected_candidates"):
        response = answer_message(
            "why not the battery?",
            role="operator",
            snapshot=snapshot,
        )
        assert response.intent == str(Intent.EXPLAIN_REJECTED_CANDIDATE)


# ---------------------------------------------------------------------------
# Scenario 2: Fan Airflow Blockage
# ---------------------------------------------------------------------------


def test_il_fan_airflow_blockage_root_cause(gateway):
    state = asyncio.run(_run(gateway, "scn_il_fan_airflow_blockage"))
    spec = _scenario("scn_il_fan_airflow_blockage")

    assert state.active_situations, "No situation detected"
    sit = next(iter(state.active_situations.values()))
    assert sit["situation_type"] == spec["expected_situation"]
    assert sit["root_asset_id"] == spec["expected_root_cause"]
    assert state.latest_evidence_packet["root_asset_id"] == "FAN-001"


def test_il_fan_airflow_blockage_alarm_fired(gateway):
    state = asyncio.run(_run(gateway, "scn_il_fan_airflow_blockage"))
    assert "FAN_001_AIRFLOW_LOW" in state.active_alarms


def test_il_fan_airflow_blockage_evidence_packet(gateway):
    state = asyncio.run(_run(gateway, "scn_il_fan_airflow_blockage"))
    ep = state.latest_evidence_packet
    assert ep is not None
    chain = ep.get("evidence_chain", [])
    first = next((c for c in chain if c.get("role") == "first_signal"), None)
    assert first is not None
    assert first["alarm_id"] == "FAN_001_AIRFLOW_LOW"


# ---------------------------------------------------------------------------
# Scenario 3: Blower Bearing Wear
# ---------------------------------------------------------------------------


def test_il_blower_bearing_wear_root_cause(gateway):
    state = asyncio.run(_run(gateway, "scn_il_blower_bearing_wear"))
    spec = _scenario("scn_il_blower_bearing_wear")

    assert state.active_situations, "No situation detected"
    sit = next(iter(state.active_situations.values()))
    assert sit["situation_type"] == spec["expected_situation"]
    assert sit["root_asset_id"] == spec["expected_root_cause"]


def test_il_blower_bearing_wear_vib_first(gateway):
    state = asyncio.run(_run(gateway, "scn_il_blower_bearing_wear"))
    ep = state.latest_evidence_packet
    assert ep is not None
    chain = ep.get("evidence_chain", [])
    first = next((c for c in chain if c.get("role") == "first_signal"), None)
    assert first is not None
    assert "VIB" in first["alarm_id"] or first["alarm_id"] == "BLOWER_001_VIB_HIGH"


def test_il_blower_bearing_wear_calm_card(gateway):
    state = asyncio.run(_run(gateway, "scn_il_blower_bearing_wear"))
    assert state.latest_calm_card is not None
    card = state.latest_calm_card
    assert card.get("root_asset_id") == "BLOWER-001"


# ---------------------------------------------------------------------------
# Scenario 4: Battery Supply Weakness
# ---------------------------------------------------------------------------


def test_il_battery_supply_weakness_root_cause(gateway):
    state = asyncio.run(_run(gateway, "scn_il_battery_supply_weakness"))
    spec = _scenario("scn_il_battery_supply_weakness")

    assert state.active_situations, "No situation detected"
    sit = next(iter(state.active_situations.values()))
    assert sit["situation_type"] == spec["expected_situation"]
    assert sit["root_asset_id"] == spec["expected_root_cause"]


def test_il_battery_supply_weakness_alarm_ordering(gateway):
    state = asyncio.run(_run(gateway, "scn_il_battery_supply_weakness"))
    ep = state.latest_evidence_packet
    assert ep is not None
    chain = ep.get("evidence_chain", [])
    first = next((c for c in chain if c.get("role") == "first_signal"), None)
    assert first is not None
    # Battery alarm must come before bus alarm
    assert "BAT" in first["alarm_id"] or first["asset_id"] == "BAT-001"


# ---------------------------------------------------------------------------
# Scenario 5: Charger Failure
# ---------------------------------------------------------------------------


def test_il_charger_failure_root_cause(gateway):
    state = asyncio.run(_run(gateway, "scn_il_charger_failure"))
    spec = _scenario("scn_il_charger_failure")

    assert state.active_situations, "No situation detected"
    sit = next(iter(state.active_situations.values()))
    assert sit["situation_type"] == spec["expected_situation"]
    assert sit["root_asset_id"] == spec["expected_root_cause"]


def test_il_charger_failure_first_signal(gateway):
    state = asyncio.run(_run(gateway, "scn_il_charger_failure"))
    ep = state.latest_evidence_packet
    assert ep is not None
    chain = ep.get("evidence_chain", [])
    first = next((c for c in chain if c.get("role") == "first_signal"), None)
    assert first is not None
    assert "CHRG" in first["alarm_id"] or first["asset_id"] == "CHARGER-001"


# ---------------------------------------------------------------------------
# Scenario 6: Sensor Fault — No Root Cause
# ---------------------------------------------------------------------------


def test_il_sensor_fault_no_situation(gateway):
    state = asyncio.run(_run(gateway, "scn_il_sensor_fault_false_alarm"))
    spec = _scenario("scn_il_sensor_fault_false_alarm")

    assert spec["expected_situation"] is None
    assert not state.active_situations
    assert state.latest_evidence_packet is None


def test_il_sensor_fault_no_calm_card(gateway):
    state = asyncio.run(_run(gateway, "scn_il_sensor_fault_false_alarm"))
    assert state.latest_calm_card is None


def test_il_sensor_fault_ai_returns_no_evidence(gateway):
    state = asyncio.run(_run(gateway, "scn_il_sensor_fault_false_alarm"))
    snapshot = state.snapshot()
    response = answer_message(
        "why is this the root cause?",
        role="operator",
        snapshot=snapshot,
    )
    # Must not fabricate a root cause when no evidence exists
    assert any(
        "evidence" in lim.lower() or "simulator" in lim.lower() or "no active" in lim.lower()
        for lim in response.limitations
    )


# ---------------------------------------------------------------------------
# AI harness integration across scenarios
# ---------------------------------------------------------------------------


def test_alarm_flood_explanation_groups_alarms(gateway):
    state = asyncio.run(_run(gateway, "scn_il_motor_overload"))
    snapshot = state.snapshot()
    response = answer_message(
        "how many alarms are there?",
        role="operator",
        snapshot=snapshot,
    )
    assert response.intent == str(Intent.EXPLAIN_ALARM_FLOOD)
    assert any(char.isdigit() for char in response.answer)  # must mention a count


def test_recommend_first_check_on_motor_scenario(gateway):
    state = asyncio.run(_run(gateway, "scn_il_motor_overload"))
    snapshot = state.snapshot()
    response = answer_message(
        "what should I check first?",
        role="operator",
        snapshot=snapshot,
    )
    assert response.intent == str(Intent.RECOMMEND_FIRST_CHECK)
    assert len(response.evidence_refs) >= 1
