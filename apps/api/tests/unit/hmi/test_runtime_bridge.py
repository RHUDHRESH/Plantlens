"""Unit tests for runtime snapshot → PlantHMIState bridge."""

from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime

import pytest

from app.hmi.contracts import HMIAssetStatus, HMIOverallStatus, HMISignalStatus
from app.hmi.operator_actions import FORBIDDEN_ACTION_PHRASES
from app.hmi.runtime_bridge import build_hmi_state_from_runtime_snapshot

FIXED_NOW = datetime(2026, 6, 20, 12, 0, 5, tzinfo=UTC)
PLANT_ID = "PLANTLENS_DEMO_BENCH"
RUN_ID = "RUN_RUNTIME_TEST"


def _tag(
    tag_id: str,
    *,
    asset_id: str,
    value: float | int | bool | str | None,
    quality: str = "GOOD",
    unit: str = "",
    timestamp: str = "2026-06-20T12:00:00Z",
) -> dict:
    return {
        "tag_id": tag_id,
        "asset_id": asset_id,
        "value": value,
        "unit": unit,
        "quality": quality,
        "timestamp": timestamp,
        "source": "simulator",
    }


def _empty_snapshot() -> dict:
    return {
        "tags": {},
        "active_alarms": [],
        "active_situations": [],
        "latest_calm_card": None,
        "asset_status": {},
    }


def _bridge(snapshot: dict, *, compiled_bundle: dict | None = None):
    return build_hmi_state_from_runtime_snapshot(
        plant_id=PLANT_ID,
        run_id=RUN_ID,
        runtime_snapshot=snapshot,
        compiled_bundle=compiled_bundle,
        now=FIXED_NOW,
    )


def _asset_by_id(state, asset_id: str):
    return next(asset for asset in state.assets if asset.asset_id == asset_id)


def _signal_by_id(state, signal_id: str):
    return next(signal for signal in state.signals if signal.signal_id == signal_id)


def _motor_situation() -> dict:
    return {
        "situation_id": "SIT_MOTOR_MECHANICAL_OVERLOAD",
        "situation_type": "MOTOR_MECHANICAL_OVERLOAD",
        "title": "Motor mechanical overload",
        "severity": "critical",
        "root_asset_id": "MTR-12V",
        "confidence": "high",
        "confidence_score": 0.86,
        "created_at": "2026-06-20T12:00:01Z",
        "grouped_alarm_ids": [
            "ALM_MTR_CURRENT_HIGH",
            "ALM_MTR_RPM_LOW",
            "ALM_AIRFLOW_LOW",
        ],
        "affected_asset_ids": ["MTR-12V", "FAN-01", "BLW-01"],
        "evidence": [
            {
                "alarm_id": "ALM_MTR_CURRENT_HIGH",
                "asset_id": "MTR-12V",
                "tag_id": "MTR_CURRENT",
                "timestamp": "2026-06-20T12:00:01Z",
                "reason": "Motor current above critical threshold",
                "role": "first_signal",
                "severity": "critical",
                "value": 2.4,
                "unit": "A",
            },
            {
                "alarm_id": "ALM_MTR_RPM_LOW",
                "asset_id": "MTR-12V",
                "tag_id": "MTR_RPM",
                "timestamp": "2026-06-20T12:00:02Z",
                "reason": "Motor RPM below threshold",
                "role": "evidence",
                "severity": "warning",
                "value": 120,
                "unit": "rpm",
            },
            {
                "alarm_id": "ALM_AIRFLOW_LOW",
                "asset_id": "BLW-01",
                "tag_id": "BLW_AIRFLOW",
                "timestamp": "2026-06-20T12:00:03Z",
                "reason": "Blower airflow below threshold",
                "role": "evidence",
                "severity": "warning",
                "value": 0.2,
                "unit": "m3/s",
            },
        ],
    }


def test_empty_runtime_snapshot_returns_warning_safe_state():
    state = _bridge(_empty_snapshot())

    assert state.overall_status == HMIOverallStatus.WARNING
    assert state.active_incident is None
    assert state.signals == []
    assert any("Runtime snapshot contains no tags." in note for note in state.data_quality.notes)
    assert any("Compiled bundle unavailable" in note for note in state.data_quality.notes)


def test_runtime_tags_convert_to_signal_states():
    snapshot = _empty_snapshot()
    snapshot["tags"] = {
        "PSU_VOLTAGE": _tag("PSU_VOLTAGE", asset_id="PSU-12V", value=12.0, unit="V"),
        "MTR_CURRENT": _tag("MTR_CURRENT", asset_id="MTR-12V", value=0.5, unit="A"),
        "MTR_RPM": _tag("MTR_RPM", asset_id="MTR-12V", value=1200, quality="STALE", unit="rpm"),
    }

    state = _bridge(snapshot)

    assert len(state.signals) == 3
    assert _signal_by_id(state, "MTR_RPM").status == HMISignalStatus.STALE
    assert "MTR_RPM" in state.data_quality.stale_signals
    assert state.overall_status == HMIOverallStatus.WARNING


def test_active_runtime_situation_maps_to_incident():
    snapshot = _empty_snapshot()
    snapshot["tags"] = {
        "PSU_VOLTAGE": _tag("PSU_VOLTAGE", asset_id="PSU-12V", value=12.0, unit="V"),
        "MTR_CURRENT": _tag("MTR_CURRENT", asset_id="MTR-12V", value=2.4, unit="A"),
        "FAN_RPM": _tag("FAN_RPM", asset_id="FAN-01", value=800, unit="rpm"),
    }
    snapshot["active_situations"] = [_motor_situation()]
    snapshot["asset_status"] = {
        "MTR-12V": "critical",
        "FAN-01": "warning",
        "BLW-01": "warning",
    }

    state = _bridge(snapshot)

    assert state.active_incident is not None
    assert state.active_incident.incident_id == "SIT_MOTOR_MECHANICAL_OVERLOAD"
    assert state.active_incident.suspected_root_cause == "MOTOR_MECHANICAL_OVERLOAD"
    assert state.active_incident.confidence == 0.86
    assert state.overall_status == HMIOverallStatus.FAULT
    assert _asset_by_id(state, "MTR-12V").status == HMIAssetStatus.FAULT
    assert _asset_by_id(state, "FAN-01").status == HMIAssetStatus.WARNING
    assert len(state.alarm_groups) == 1


def test_latest_calm_card_maps_to_operator_action():
    snapshot = _empty_snapshot()
    snapshot["tags"] = {
        "MTR_CURRENT": _tag("MTR_CURRENT", asset_id="MTR-12V", value=2.4, unit="A"),
    }
    snapshot["active_situations"] = [_motor_situation()]
    snapshot["latest_calm_card"] = {
        "root_asset_id": "MTR-12V",
        "why_it_matters": "Current and speed evidence point to overload.",
        "recommended_first_check": {
            "label": "Inspect motor coupling",
            "risk_level": "medium",
            "requires_isolation": True,
        },
    }

    state = _bridge(snapshot)

    assert len(state.operator_actions) >= 1
    first = state.operator_actions[0]
    assert first.title == "Inspect motor coupling"
    assert first.target_asset_id == "MTR-12V"
    assert first.safety_level.value == "isolate_before_touch"
    assert "Current and speed evidence point to overload." in first.rationale


def test_no_calm_card_but_incident_gets_fallback_action():
    snapshot = _empty_snapshot()
    snapshot["tags"] = {
        "MTR_CURRENT": _tag("MTR_CURRENT", asset_id="MTR-12V", value=2.4, unit="A"),
    }
    snapshot["active_situations"] = [_motor_situation()]
    snapshot["latest_calm_card"] = None

    state = _bridge(snapshot)

    assert state.operator_actions[0].title == "Review runtime situation"


def test_graph_index_approved_edges_are_used():
    """Compiler emits graph_index.approved_edges — runtime bridge must consume them."""
    compiled_bundle = {
        "asset_index": {
            "MTR-12V": {"name": "12V DC Motor", "kind": "motor"},
            "FAN-01": {"name": "Fan", "kind": "fan"},
        },
        "graph_index": {
            "approved_edges": [
                {
                    "id": "EDGE_MOTOR_TO_FAN",
                    "from": "MTR-12V",
                    "to": "FAN-01",
                    "edge_type": "structural_power",
                    "approved": True,
                }
            ],
        },
    }
    snapshot = _empty_snapshot()
    snapshot["tags"] = {
        "MTR_CURRENT": _tag("MTR_CURRENT", asset_id="MTR-12V", value=2.4, unit="A"),
        "FAN_RPM": _tag("FAN_RPM", asset_id="FAN-01", value=800, unit="rpm"),
    }
    snapshot["active_situations"] = [_motor_situation()]

    state = _bridge(snapshot, compiled_bundle=compiled_bundle)

    assert len(state.causality_edges) == 1
    edge = state.causality_edges[0]
    assert edge.edge_id == "EDGE_MOTOR_TO_FAN"
    assert edge.from_asset_id == "MTR-12V"
    assert edge.to_asset_id == "FAN-01"
    assert edge.relation == "structural_power"
    assert edge.active is True
    assert not any("did not include usable causality edges" in note for note in state.data_quality.notes)


def test_compiled_bundle_assets_and_edges_are_used():
    compiled_bundle = {
        "assets": [
            {"asset_id": "PSU-12V", "name": "12V Power Supply", "kind": "power_supply"},
            {"asset_id": "MTR-12V", "name": "12V DC Motor", "kind": "motor"},
        ],
        "causality_edges": [
            {
                "edge_id": "EDGE_PSU_TO_MOTOR",
                "from_asset_id": "PSU-12V",
                "to_asset_id": "MTR-12V",
                "relation": "feeds",
            }
        ],
    }
    snapshot = _empty_snapshot()
    snapshot["tags"] = {
        "PSU_VOLTAGE": _tag("PSU_VOLTAGE", asset_id="PSU-12V", value=12.0, unit="V"),
        "MTR_CURRENT": _tag("MTR_CURRENT", asset_id="MTR-12V", value=2.4, unit="A"),
    }
    snapshot["active_situations"] = [
        {
            "situation_id": "SIT_SUPPLY_MOTOR",
            "situation_type": "SUPPLY_MOTOR_ISSUE",
            "title": "Supply and motor issue",
            "severity": "warning",
            "root_asset_id": "PSU-12V",
            "created_at": "2026-06-20T12:00:01Z",
            "grouped_alarm_ids": ["ALM_MTR_CURRENT_HIGH"],
            "affected_asset_ids": ["PSU-12V", "MTR-12V"],
            "evidence": [],
        }
    ]

    state = _bridge(snapshot, compiled_bundle=compiled_bundle)

    assert _asset_by_id(state, "PSU-12V").name == "12V Power Supply"
    assert _asset_by_id(state, "MTR-12V").name == "12V DC Motor"
    assert len(state.causality_edges) == 1
    assert state.causality_edges[0].relation == "feeds"
    assert state.causality_edges[0].active is True


def test_missing_compiled_bundle_infers_assets():
    snapshot = _empty_snapshot()
    snapshot["tags"] = {
        "MTR_CURRENT": _tag("MTR_CURRENT", asset_id="MTR-12V", value=0.5, unit="A"),
        "PSU_VOLTAGE": _tag("PSU_VOLTAGE", asset_id="PSU-12V", value=12.0, unit="V"),
    }

    state = _bridge(snapshot, compiled_bundle=None)

    asset_ids = {asset.asset_id for asset in state.assets}
    assert "MTR-12V" in asset_ids
    assert "PSU-12V" in asset_ids
    assert any("Compiled bundle unavailable" in note for note in state.data_quality.notes)


def test_runtime_asset_status_mapping():
    snapshot = _empty_snapshot()
    snapshot["asset_status"] = {
        "A": "normal",
        "B": "warning",
        "C": "critical",
        "D": "sensor_bad",
        "E": "offline",
        "F": "unknown",
    }

    state = _bridge(snapshot)

    assert _asset_by_id(state, "A").status == HMIAssetStatus.HEALTHY
    assert _asset_by_id(state, "B").status == HMIAssetStatus.WARNING
    assert _asset_by_id(state, "C").status == HMIAssetStatus.FAULT
    assert _asset_by_id(state, "D").status == HMIAssetStatus.WARNING
    assert _asset_by_id(state, "E").status == HMIAssetStatus.OFFLINE
    assert _asset_by_id(state, "F").status == HMIAssetStatus.WARNING


def test_stale_tag_does_not_become_fault_even_if_alarm_exists():
    snapshot = _empty_snapshot()
    snapshot["tags"] = {
        "MTR_RPM": _tag("MTR_RPM", asset_id="MTR-12V", value=120, quality="STALE", unit="rpm"),
    }
    snapshot["active_alarms"] = [
        {
            "alarm_id": "ALM_MTR_RPM_LOW",
            "asset_id": "MTR-12V",
            "tag_id": "MTR_RPM",
            "severity": "critical",
            "message": "RPM low",
        }
    ]

    state = _bridge(snapshot)
    signal = _signal_by_id(state, "MTR_RPM")

    assert signal.status == HMISignalStatus.STALE
    assert signal.evidence_weight == 0.0
    assert "MTR_RPM" in state.data_quality.stale_signals


def test_malformed_tags_type_fails_loudly():
    snapshot = _empty_snapshot()
    snapshot["tags"] = []

    with pytest.raises(ValueError, match="runtime_snapshot.tags must be a mapping"):
        _bridge(snapshot)


def test_bridge_does_not_mutate_snapshot():
    snapshot = _empty_snapshot()
    snapshot["tags"] = {
        "MTR_CURRENT": _tag("MTR_CURRENT", asset_id="MTR-12V", value=2.4, unit="A"),
    }
    snapshot["active_situations"] = [_motor_situation()]
    original = deepcopy(snapshot)

    _bridge(snapshot)

    assert snapshot == original


def test_bridge_output_deterministic_with_fixed_now():
    snapshot = _empty_snapshot()
    snapshot["tags"] = {
        "MTR_CURRENT": _tag("MTR_CURRENT", asset_id="MTR-12V", value=2.4, unit="A"),
    }
    snapshot["active_situations"] = [_motor_situation()]

    first = _bridge(snapshot).model_dump(mode="json")
    second = _bridge(snapshot).model_dump(mode="json")

    assert first == second


def test_no_fake_incident_from_data_quality_only():
    snapshot = _empty_snapshot()
    snapshot["tags"] = {
        "MTR_RPM": _tag("MTR_RPM", asset_id="MTR-12V", value=None, quality="MISSING", unit="rpm"),
    }
    snapshot["active_alarms"] = []
    snapshot["active_situations"] = []

    state = _bridge(snapshot)

    assert state.active_incident is None
    assert state.overall_status == HMIOverallStatus.WARNING
    assert state.root_cause_candidates == []
    assert len(state.operator_actions) == 1
    assert state.operator_actions[0].title == "Verify sensor data quality"


def test_alarm_group_uses_primary_and_secondary_runtime_alarms():
    snapshot = _empty_snapshot()
    snapshot["active_situations"] = [
        {
            "situation_id": "SIT_ALARM_GROUP",
            "situation_type": "TEST_ALARM_GROUP",
            "title": "Grouped runtime alarms",
            "severity": "critical",
            "root_asset_id": "MTR-12V",
            "created_at": "2026-06-20T12:00:01Z",
            "grouped_alarm_ids": ["ALM_ROOT", "ALM_DOWNSTREAM_1", "ALM_DOWNSTREAM_2"],
            "affected_asset_ids": ["MTR-12V"],
            "evidence": [
                {
                    "alarm_id": "ALM_ROOT",
                    "asset_id": "MTR-12V",
                    "tag_id": "MTR_CURRENT",
                    "timestamp": "2026-06-20T12:00:01Z",
                    "reason": "Root alarm",
                    "role": "first_signal",
                    "severity": "critical",
                }
            ],
        }
    ]

    state = _bridge(snapshot)
    group = state.alarm_groups[0]

    assert group.root_alarm == "ALM_ROOT"
    assert set(group.grouped_alarms) == {"ALM_ROOT", "ALM_DOWNSTREAM_1", "ALM_DOWNSTREAM_2"}
    assert group.suppressed_duplicates == ["ALM_DOWNSTREAM_1", "ALM_DOWNSTREAM_2"]


def test_safety_language_does_not_claim_auto_control():
    snapshot = _empty_snapshot()
    snapshot["tags"] = {
        "MTR_CURRENT": _tag("MTR_CURRENT", asset_id="MTR-12V", value=2.4, unit="A"),
    }
    snapshot["active_situations"] = [_motor_situation()]
    snapshot["latest_calm_card"] = {
        "root_asset_id": "MTR-12V",
        "why_it_matters": "Current and speed evidence point to overload.",
        "recommended_first_check": {
            "label": "Inspect motor coupling",
            "risk_level": "medium",
            "requires_isolation": True,
        },
    }

    state = _bridge(snapshot)

    forbidden = (
        "PlantLens trips",
        "PlantLens shuts down",
        "automatically controls",
        "writes to PLC",
        "directly controls",
    )
    for action in state.operator_actions:
        combined = f"{action.instruction} {action.rationale}"
        for phrase in forbidden:
            assert phrase not in combined

    for phrase in FORBIDDEN_ACTION_PHRASES:
        for action in state.operator_actions:
            combined = f"{action.instruction} {action.rationale}"
            assert phrase not in combined