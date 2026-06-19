"""Runtime core E2E tests (Prompts 21-22)."""

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
from app.schemas.calm_card import CalmCard
from app.schemas.situation import Situation
from app.schemas.tag_frame import TagFrame

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


async def _run_scenario(gateway: SimulatorGateway, scenario_id: str) -> RuntimeState:
    await gateway.start(scenario_id, realtime=False)
    return gateway._state


def test_hero_motor_overload_end_to_end(gateway: SimulatorGateway):
    state = asyncio.run(_run_scenario(gateway, "scn_motor_overload"))
    scenario = next(s for s in SCENARIOS["scenarios"] if s["id"] == "scn_motor_overload")

    alarm_ids = set(state.active_alarms.keys())
    assert set(scenario["expected_alarms"]).issubset(alarm_ids)

    assert len(state.active_situations) == 1
    situation = next(iter(state.active_situations.values()))
    Situation.model_validate(situation)

    assert situation["situation_type"] == scenario["expected_situation"]
    assert situation["root_asset_id"] == scenario["expected_root_cause"]
    assert len(situation["grouped_alarm_ids"]) == len(scenario["expected_alarms"])

    evidence_ids = [item["alarm_id"] for item in situation["evidence"]]
    assert evidence_ids[0] == "MOTOR_CURRENT_HIGH"
    assert evidence_ids.index("MOTOR_SPEED_LOW") < evidence_ids.index("DC_BUS_LOW")
    assert evidence_ids.index("DC_BUS_LOW") < evidence_ids.index("INV_UNDERVOLTAGE")

    assert state.latest_calm_card is not None
    CalmCard.model_validate(state.latest_calm_card)
    assert state.latest_calm_card["recommended_first_check"]["action_id"] == "INSPECT_SHAFT_LOAD"


def test_sensor_stale_no_confident_situation(gateway: SimulatorGateway):
    state = asyncio.run(_run_scenario(gateway, "scn_sensor_stale_no_root"))
    scenario = next(s for s in SCENARIOS["scenarios"] if s["id"] == "scn_sensor_stale_no_root")

    assert state.active_alarms == {}
    assert state.active_situations == {}
    assert state.latest_calm_card is None
    assert scenario["expected_situation"] is None
    assert state.asset_status.get("MTR-301") == "sensor_bad"


def test_raw_alarms_preserved_in_situation(gateway: SimulatorGateway):
    state = asyncio.run(_run_scenario(gateway, "scn_motor_overload"))
    situation = next(iter(state.active_situations.values()))
    assert set(situation["grouped_alarm_ids"]) == set(state.active_alarms.keys())


def test_tag_frames_validate(gateway: SimulatorGateway):
    state = asyncio.run(_run_scenario(gateway, "scn_motor_overload"))
    for frame_data in state.tags.values():
        TagFrame.model_validate(frame_data.model_dump(mode="json"))


def test_projection_is_advisory_only(gateway: SimulatorGateway):
    state = asyncio.run(_run_scenario(gateway, "scn_motor_overload"))
    card = state.latest_calm_card
    assert card is not None
    projection = card.get("time_to_consequence")
    if projection is not None:
        assert "state" in projection
        assert "target_tag" in projection


def test_all_demo_scenarios_metadata(gateway: SimulatorGateway):
    for scenario in SCENARIOS["scenarios"]:
        state = asyncio.run(_run_scenario(gateway, scenario["id"]))
        if scenario["expected_alarms"]:
            assert set(scenario["expected_alarms"]).issubset(state.active_alarms.keys())
        else:
            assert not state.active_alarms
        if scenario["expected_situation"] is None:
            assert not state.active_situations
        else:
            assert len(state.active_situations) == 1
            situation = next(iter(state.active_situations.values()))
            assert situation["situation_type"] == scenario["expected_situation"]
            if scenario["expected_root_cause"]:
                assert situation["root_asset_id"] == scenario["expected_root_cause"]