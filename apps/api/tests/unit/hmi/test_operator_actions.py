"""Unit tests for advisory HMI operator actions."""

import json
from datetime import UTC, datetime
from pathlib import Path

from app.hmi.contracts import DataQualityState, SafetyLevel
from app.hmi.fault_rules import classify_bench_faults
from app.hmi.incident_builder import build_hmi_incident
from app.hmi.operator_actions import FORBIDDEN_ACTION_PHRASES, build_operator_actions
from app.hmi.status import build_data_quality, evaluate_signals
from app.hmi.bench_adapter import load_bench_payload

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "hmi"
FIXED_NOW = datetime(2026, 6, 20, 12, 0, 5, tzinfo=UTC)

SUPPLY_ACTION_TITLES = (
    "Verify 12V supply",
    "Check wiring and terminal looseness",
    "Check converter or supply module",
)


def _load_fixture(name: str) -> dict:
    with (FIXTURES_DIR / name).open(encoding="utf-8") as handle:
        return json.load(handle)


def _build_incident(fixture_name: str):
    bench = load_bench_payload(_load_fixture(fixture_name))
    signals = evaluate_signals(bench.signals, now=FIXED_NOW)
    data_quality = build_data_quality(signals)
    candidates = classify_bench_faults(signals, data_quality)
    incident = build_hmi_incident(
        bench=bench,
        signals=signals,
        candidates=candidates,
        data_quality=data_quality,
        now=FIXED_NOW,
    )
    return incident, candidates, data_quality


def test_no_incident_clean_data_returns_no_actions():
    actions = build_operator_actions(
        incident=None,
        candidates=[],
        data_quality=DataQualityState(),
    )
    assert actions == []


def test_no_incident_with_data_quality_returns_sensor_action():
    _, _, data_quality = _build_incident("missing_sensor.json")
    actions = build_operator_actions(
        incident=None,
        candidates=[],
        data_quality=data_quality,
    )

    assert len(actions) == 1
    assert actions[0].title == "Verify sensor data quality"
    assert actions[0].safety_level == SafetyLevel.OBSERVE


def test_motor_obstruction_actions_are_ordered_and_safe():
    incident, candidates, data_quality = _build_incident("motor_obstruction.json")
    actions = build_operator_actions(
        incident=incident,
        candidates=candidates,
        data_quality=data_quality,
    )

    assert len(actions) == 3
    assert [action.priority for action in actions] == [1, 2, 3]
    assert actions[0].target_asset_id == "MTR-12V"
    assert actions[0].safety_level == SafetyLevel.STOP_REQUIRED

    combined_text = " ".join(
        f"{action.title} {action.instruction} {action.rationale}" for action in actions
    ).lower()
    for phrase in FORBIDDEN_ACTION_PHRASES:
        assert phrase.lower() not in combined_text


def test_supply_voltage_actions_target_psu():
    incident, candidates, data_quality = _build_incident("voltage_sag.json")
    actions = build_operator_actions(
        incident=incident,
        candidates=candidates,
        data_quality=data_quality,
    )

    assert actions[0].target_asset_id == "PSU-12V"
    assert tuple(action.title for action in actions) == SUPPLY_ACTION_TITLES


def test_airflow_blockage_actions_target_blower():
    incident, candidates, data_quality = _build_incident("airflow_blockage.json")
    actions = build_operator_actions(
        incident=incident,
        candidates=candidates,
        data_quality=data_quality,
    )

    assert actions[0].target_asset_id == "BLW-01"
    combined_text = " ".join(action.instruction for action in actions).lower()
    assert "blower" in combined_text
    assert "restriction" in combined_text or "blockage" in combined_text
    assert not any("stop motor" in action.title.lower() for action in actions)


def test_actions_are_deterministic():
    first_incident, first_candidates, first_dq = _build_incident("motor_obstruction.json")
    second_incident, second_candidates, second_dq = _build_incident("motor_obstruction.json")

    first_actions = build_operator_actions(
        incident=first_incident,
        candidates=first_candidates,
        data_quality=first_dq,
    )
    second_actions = build_operator_actions(
        incident=second_incident,
        candidates=second_candidates,
        data_quality=second_dq,
    )

    assert [action.model_dump(mode="json") for action in first_actions] == [
        action.model_dump(mode="json") for action in second_actions
    ]