"""Alarm engine tests (Prompts 17-18)."""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.runtime.alarm_engine import (
    AlarmEngineState,
    evaluate_alarms,
    reset_alarm_engine_state,
)
from app.runtime.runtime_state import RuntimeState
from app.schemas.alarm import AlarmRule, AlarmRules
from app.schemas.tag_frame import TagFrame

REPO_ROOT = Path(__file__).resolve().parents[3]
DEMO_ALARM_RULES = REPO_ROOT / "packages" / "sample-data" / "demo-microgrid" / "alarm_rules.json"
API_ROOT = Path(__file__).resolve().parents[1]
TS = datetime(2026, 6, 18, 12, 0, 0, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def reset_engine() -> None:
    reset_alarm_engine_state()
    yield
    reset_alarm_engine_state()


@pytest.fixture
def rules() -> list[AlarmRule]:
    bundle = AlarmRules.model_validate(json.loads(DEMO_ALARM_RULES.read_text(encoding="utf-8")))
    return bundle.rules


def _frame(tag_id: str, value, *, quality: str = "GOOD", at_ms: int = 0) -> TagFrame:
    return TagFrame(
        tag_id=tag_id,
        asset_id="MTR-301" if tag_id.startswith("MOTOR") else "BUS-101",
        value=value,
        unit="A",
        quality=quality,  # type: ignore[arg-type]
        timestamp=TS.replace(microsecond=at_ms * 1000),
        source="simulator",
    )


def test_dc_bus_low_critical_band(rules: list[AlarmRule]):
    state = RuntimeState()
    engine = AlarmEngineState()
    state.update_tag(_frame("BUS_101_V", 37.0, at_ms=0))
    evaluate_alarms(state, rules, TS, engine_state=engine)
    alarms = evaluate_alarms(
        state,
        rules,
        TS + timedelta(milliseconds=600),
        engine_state=engine,
    )
    dc_bus = next(alarm for alarm in alarms if alarm["alarm_id"] == "DC_BUS_LOW")
    assert dc_bus["severity"] == "critical"


def test_stale_tag_does_not_raise_process_alarm(rules: list[AlarmRule]):
    state = RuntimeState()
    state.update_tag(_frame("MOTOR_301_CURRENT", 99.0, quality="STALE"))
    alarms = evaluate_alarms(state, rules, TS)
    assert "MOTOR_CURRENT_HIGH" not in {alarm["alarm_id"] for alarm in alarms}


def test_debounce_blocks_one_frame_spike(rules: list[AlarmRule]):
    state = RuntimeState()
    engine = AlarmEngineState()
    state.update_tag(_frame("MOTOR_301_TEMP", 80.0))
    alarms = evaluate_alarms(state, rules, TS, engine_state=engine)
    assert "MOTOR_TEMP_HIGH" not in {alarm["alarm_id"] for alarm in alarms}


def test_deadband_prevents_clear_chatter(rules: list[AlarmRule]):
    state = RuntimeState()
    engine = AlarmEngineState()
    state.update_tag(_frame("MOTOR_301_CURRENT", 3.5))
    first = evaluate_alarms(state, rules, TS, engine_state=engine)
    assert any(alarm["alarm_id"] == "MOTOR_CURRENT_HIGH" for alarm in first)
    state.update_tag(_frame("MOTOR_301_CURRENT", 3.05))
    second = evaluate_alarms(state, rules, TS.replace(microsecond=1000), engine_state=engine)
    assert any(alarm["alarm_id"] == "MOTOR_CURRENT_HIGH" for alarm in second)


def test_bool_true_operator(rules: list[AlarmRule]):
    state = RuntimeState()
    state.update_tag(
        TagFrame(
            tag_id="INV_102_UNDERVOLTAGE",
            asset_id="INV-102",
            value=True,
            unit="bool",
            quality="GOOD",
            timestamp=TS,
            source="simulator",
        )
    )
    alarms = evaluate_alarms(state, rules, TS)
    assert "INV_UNDERVOLTAGE" in {alarm["alarm_id"] for alarm in alarms}


def test_invalid_severity_rejected():
    with pytest.raises(Exception):
        AlarmRule.model_validate(
            {
                "id": "BAD_RULE",
                "tag": "BUS_101_V",
                "severity": "high",
                "condition": {"op": "<", "threshold": 10.0},
                "message": "bad",
            }
        )


def test_deterministic_alarm_sequence(rules: list[AlarmRule]):
    state = RuntimeState()
    state.update_tag(_frame("MOTOR_301_CURRENT", 3.5))
    state.update_tag(_frame("MOTOR_301_RPM", 700.0))
    first = evaluate_alarms(state, rules, TS)
    second = evaluate_alarms(state, rules, TS)
    assert first == second


def test_hero_expected_alarms_after_scenario(rules: list[AlarmRule]):
    from app.runtime.simulator.scenario_runner import ScenarioRunner

    runner = ScenarioRunner(
        scenarios_path=REPO_ROOT / "packages/sample-data/demo-microgrid/scenarios.json",
        tag_map_path=REPO_ROOT / "packages/sample-data/demo-microgrid/tag_map.json",
    )
    state = RuntimeState()
    engine = AlarmEngineState()

    async def emit(frame: TagFrame) -> None:
        state.update_tag(frame)
        alarms = evaluate_alarms(state, rules, frame.timestamp, engine_state=engine)
        state.active_alarms = {alarm["alarm_id"]: alarm for alarm in alarms}

    import asyncio

    asyncio.run(runner.run_scenario("scn_motor_overload", emit, realtime=False))
    final_ts = max(frame.timestamp for frame in state.tags.values()) + timedelta(milliseconds=1000)
    alarms = evaluate_alarms(state, rules, final_ts, engine_state=engine)
    state.active_alarms = {alarm["alarm_id"]: alarm for alarm in alarms}
    alarm_ids = set(state.active_alarms.keys())
    expected = {
        "MOTOR_CURRENT_HIGH",
        "MOTOR_SPEED_LOW",
        "DC_BUS_LOW",
        "INV_UNDERVOLTAGE",
        "MOTOR_TEMP_HIGH",
    }
    assert expected.issubset(alarm_ids)


def test_alarm_engine_does_not_import_dag_or_agents():
    script = (
        "import sys; "
        "import app.runtime.alarm_engine; "
        "mods = sorted(m for m in sys.modules if m.startswith(('app.runtime.dag_runtime', 'app.agents'))); "
        "print(mods)"
    )
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=API_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.stdout.strip() == "[]"