"""Unit tests for the deterministic HMI projector."""

import json
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.hmi.contracts import HMIAssetStatus, HMIOverallStatus, HMISignalStatus
from app.hmi.fault_rules import (
    CAUSE_DOWNSTREAM_AIRFLOW_BLOCKAGE,
    CAUSE_MOTOR_MECHANICAL_OBSTRUCTION,
    CAUSE_SUPPLY_VOLTAGE_SAG,
)
from app.hmi.projector import build_hmi_state

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "hmi"
FIXED_NOW = datetime(2026, 6, 20, 12, 0, 5, tzinfo=UTC)


def _load_fixture(name: str) -> dict:
    with (FIXTURES_DIR / name).open(encoding="utf-8") as handle:
        return json.load(handle)


def _asset_by_id(state, asset_id: str):
    return next(asset for asset in state.assets if asset.asset_id == asset_id)


def test_healthy_fixture_produces_healthy_hmi_state():
    state = build_hmi_state(_load_fixture("healthy_motor_fan_blower.json"), now=FIXED_NOW)

    assert state.overall_status == HMIOverallStatus.HEALTHY
    assert state.active_incident is None
    assert state.root_cause_candidates == []
    assert state.operator_actions == []
    assert all(asset.status == HMIAssetStatus.HEALTHY for asset in state.assets)
    assert all(signal.status == HMISignalStatus.NORMAL for signal in state.signals)
    assert state.data_quality.confidence_penalty == 0.0


def test_motor_obstruction_produces_fault_state():
    state = build_hmi_state(_load_fixture("motor_obstruction.json"), now=FIXED_NOW)

    assert state.overall_status == HMIOverallStatus.FAULT
    assert state.active_incident is not None
    assert state.active_incident.suspected_root_cause == CAUSE_MOTOR_MECHANICAL_OBSTRUCTION
    assert state.root_cause_candidates[0].cause_id == CAUSE_MOTOR_MECHANICAL_OBSTRUCTION
    assert _asset_by_id(state, "MTR-12V").status == HMIAssetStatus.FAULT
    assert _asset_by_id(state, "FAN-01").status == HMIAssetStatus.WARNING
    assert _asset_by_id(state, "BLW-01").status == HMIAssetStatus.WARNING
    assert state.suppressed_symptoms == ["FAN_RPM", "BLW_AIRFLOW"]
    assert state.operator_actions[0].target_asset_id == "MTR-12V"
    assert any(edge.active for edge in state.causality_edges)


def test_voltage_sag_produces_supply_root():
    state = build_hmi_state(_load_fixture("voltage_sag.json"), now=FIXED_NOW)

    assert state.overall_status == HMIOverallStatus.FAULT
    assert state.active_incident is not None
    assert state.active_incident.suspected_root_cause == CAUSE_SUPPLY_VOLTAGE_SAG
    assert state.active_incident.primary_alarms == ["PSU_VOLTAGE"]
    assert _asset_by_id(state, "PSU-12V").status == HMIAssetStatus.FAULT
    assert _asset_by_id(state, "MTR-12V").status == HMIAssetStatus.WARNING
    assert _asset_by_id(state, "FAN-01").status == HMIAssetStatus.WARNING
    assert _asset_by_id(state, "BLW-01").status == HMIAssetStatus.WARNING
    assert state.operator_actions[0].target_asset_id == "PSU-12V"


def test_airflow_blockage_does_not_blame_motor():
    state = build_hmi_state(_load_fixture("airflow_blockage.json"), now=FIXED_NOW)

    assert state.active_incident is not None
    assert state.active_incident.suspected_root_cause == CAUSE_DOWNSTREAM_AIRFLOW_BLOCKAGE
    assert _asset_by_id(state, "MTR-12V").status == HMIAssetStatus.HEALTHY
    assert _asset_by_id(state, "FAN-01").status == HMIAssetStatus.HEALTHY
    assert _asset_by_id(state, "BLW-01").status == HMIAssetStatus.FAULT
    assert state.active_incident.primary_alarms == ["BLW_AIRFLOW"]
    assert state.operator_actions[0].target_asset_id == "BLW-01"
    assert not any("Stop motor" in action.title for action in state.operator_actions)


def test_stale_sensor_reduces_confidence_and_sets_warning_or_fault_appropriately():
    clean_state = build_hmi_state(_load_fixture("motor_obstruction.json"), now=FIXED_NOW)
    stale_state = build_hmi_state(_load_fixture("stale_sensor.json"), now=FIXED_NOW)

    assert stale_state.data_quality.stale_signals
    assert stale_state.data_quality.confidence_penalty > 0
    assert stale_state.active_incident is not None
    assert clean_state.active_incident is not None
    assert stale_state.active_incident.confidence < clean_state.active_incident.confidence
    assert "MTR_RPM" not in stale_state.active_incident.primary_alarms


def test_missing_sensor_does_not_invent_root_cause():
    state = build_hmi_state(_load_fixture("missing_sensor.json"), now=FIXED_NOW)

    assert "MTR_VIBRATION" in state.data_quality.missing_signals
    assert state.active_incident is None
    assert state.overall_status == HMIOverallStatus.WARNING
    assert state.operator_actions[0].title == "Verify sensor data quality"


def test_gate_fail_blocks_projection():
    gate_results = [
        {
            "gate_name": "artifact_integrity",
            "verdict": "fail",
            "issues": [
                {
                    "code": "HASH_MISMATCH",
                    "severity": "BLOCKER",
                    "message": "hash mismatch",
                }
            ],
        }
    ]
    state = build_hmi_state(
        _load_fixture("healthy_motor_fan_blower.json"),
        gate_results=gate_results,
        now=FIXED_NOW,
    )

    assert state.overall_status == HMIOverallStatus.BLOCKED
    assert state.active_incident is None
    assert state.assets == []
    assert state.signals == []
    assert state.root_cause_candidates == []
    assert state.operator_actions == []
    assert state.data_quality.confidence_penalty == 1.0
    notes_text = " ".join(state.data_quality.notes)
    assert "artifact_integrity" in notes_text
    assert "HASH_MISMATCH" in notes_text


def test_gate_blocker_with_warn_verdict_still_blocks():
    gate_results = [
        {
            "gate_name": "industrial_truth",
            "verdict": "warn",
            "issues": [{"code": "UNSAFE_MAPPING", "severity": "BLOCKER"}],
        }
    ]
    state = build_hmi_state(
        _load_fixture("healthy_motor_fan_blower.json"),
        gate_results=gate_results,
        now=FIXED_NOW,
    )

    assert state.overall_status == HMIOverallStatus.BLOCKED


def test_non_blocking_gate_warn_allows_projection():
    gate_results = [
        {
            "gate_name": "canonical_schema",
            "verdict": "warn",
            "issues": [{"code": "UNKNOWN_SIDE", "severity": "MEDIUM"}],
        }
    ]
    state = build_hmi_state(
        _load_fixture("healthy_motor_fan_blower.json"),
        gate_results=gate_results,
        now=FIXED_NOW,
    )

    assert state.overall_status == HMIOverallStatus.HEALTHY


def test_input_payload_not_mutated():
    payload = _load_fixture("motor_obstruction.json")
    original = deepcopy(payload)

    build_hmi_state(payload, now=FIXED_NOW)

    assert payload == original


def test_output_deterministic_when_now_fixed():
    first = build_hmi_state(_load_fixture("motor_obstruction.json"), now=FIXED_NOW)
    second = build_hmi_state(_load_fixture("motor_obstruction.json"), now=FIXED_NOW)

    assert first.model_dump(mode="json") == second.model_dump(mode="json")


def test_contract_serializes_cleanly_to_json():
    state = build_hmi_state(_load_fixture("motor_obstruction.json"), now=FIXED_NOW)
    dumped = state.model_dump(mode="json")

    assert isinstance(dumped["generated_at"], str)


def test_malformed_payload_fails_loudly():
    payload = _load_fixture("healthy_motor_fan_blower.json")
    del payload["signals"]

    with pytest.raises((ValidationError, ValueError, KeyError, TypeError)):
        build_hmi_state(payload, now=FIXED_NOW)


def test_causality_edges_preserved_and_active():
    payload = _load_fixture("motor_obstruction.json")
    state = build_hmi_state(payload, now=FIXED_NOW)

    fixture_edge_ids = [edge["edge_id"] for edge in payload["causality_edges"]]
    assert [edge.edge_id for edge in state.causality_edges] == fixture_edge_ids

    active_edges = [edge for edge in state.causality_edges if edge.active]
    active_pairs = {(edge.from_asset_id, edge.to_asset_id) for edge in active_edges}
    assert ("MTR-12V", "FAN-01") in active_pairs
    assert ("FAN-01", "BLW-01") in active_pairs