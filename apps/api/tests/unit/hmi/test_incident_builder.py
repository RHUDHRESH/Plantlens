"""Unit tests for deterministic HMI incident builder."""

import json
from datetime import UTC, datetime
from pathlib import Path

from app.hmi.bench_adapter import load_bench_payload
from app.hmi.contracts import HMIAssetStatus, HMISeverity, HMISignalStatus
from app.hmi.fault_rules import (
    CAUSE_DOWNSTREAM_AIRFLOW_BLOCKAGE,
    CAUSE_MOTOR_MECHANICAL_OBSTRUCTION,
    CAUSE_SUPPLY_VOLTAGE_SAG,
    classify_bench_faults,
)
from app.hmi.incident_builder import (
    build_alarm_groups,
    build_asset_states,
    build_hmi_incident,
    build_suppressed_symptoms,
)
from app.hmi.status import build_data_quality, evaluate_signals

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "hmi"
FIXED_NOW = datetime(2026, 6, 20, 12, 0, 5, tzinfo=UTC)

MOTOR_SUMMARY = (
    "Motor-side evidence points to mechanical obstruction; downstream fan and blower "
    "symptoms are grouped under the motor incident."
)
SUPPLY_SUMMARY = (
    "Supply voltage is below range and multiple downstream assets degraded together, "
    "pointing to a power supply issue."
)
AIRFLOW_SUMMARY = (
    "Airflow is low while supply and motor evidence remain normal, pointing to a "
    "downstream airflow restriction."
)


def _load_fixture(name: str) -> dict:
    with (FIXTURES_DIR / name).open(encoding="utf-8") as handle:
        return json.load(handle)


def _project_parts(fixture_name: str):
    payload = _load_fixture(fixture_name)
    bench = load_bench_payload(payload)
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
    suppressed = build_suppressed_symptoms(incident=incident, signals=signals)
    groups = build_alarm_groups(incident=incident, signals=signals, candidates=candidates)
    assets = build_asset_states(
        bench=bench,
        signals=signals,
        incident=incident,
        suppressed_symptoms=suppressed,
        data_quality=data_quality,
    )
    return bench, signals, data_quality, candidates, incident, suppressed, groups, assets


def _asset_by_id(assets, asset_id: str):
    return next(asset for asset in assets if asset.asset_id == asset_id)


def test_healthy_has_no_incident_no_groups_no_suppression():
    _, _, _, _, incident, suppressed, groups, assets = _project_parts(
        "healthy_motor_fan_blower.json"
    )

    assert incident is None
    assert groups == []
    assert suppressed == []
    for asset in assets:
        assert asset.status == HMIAssetStatus.HEALTHY
        assert asset.health_score == 100.0


def test_motor_obstruction_builds_incident():
    _, _, _, _, incident, _, _, _ = _project_parts("motor_obstruction.json")

    assert incident is not None
    assert incident.incident_id == "INC_MOTOR_MECHANICAL_OBSTRUCTION"
    assert incident.suspected_root_cause == CAUSE_MOTOR_MECHANICAL_OBSTRUCTION
    assert incident.severity == HMISeverity.CRITICAL
    assert "MTR_CURRENT" in incident.primary_alarms
    assert "MTR_RPM" in incident.primary_alarms
    assert "MTR_VIBRATION" in incident.primary_alarms
    assert "FAN_RPM" in incident.secondary_symptoms
    assert "BLW_AIRFLOW" in incident.secondary_symptoms
    assert incident.summary == MOTOR_SUMMARY
    assert {"MTR-12V", "FAN-01", "BLW-01"}.issubset(set(incident.affected_assets))


def test_motor_obstruction_groups_downstream_symptoms():
    _, _, _, _, incident, suppressed, groups, _ = _project_parts("motor_obstruction.json")

    assert len(groups) == 1
    group = groups[0]
    assert group.group_id == "AG_MOTOR_MECHANICAL_OBSTRUCTION"
    assert group.root_alarm == "MTR_CURRENT"
    assert group.grouped_alarms == [
        "MTR_CURRENT",
        "MTR_RPM",
        "MTR_VIBRATION",
        "MTR_TEMP",
        "FAN_RPM",
        "BLW_AIRFLOW",
    ]
    assert group.suppressed_duplicates == ["FAN_RPM", "BLW_AIRFLOW"]
    assert suppressed == ["FAN_RPM", "BLW_AIRFLOW"]


def test_motor_obstruction_asset_states():
    _, _, _, _, incident, suppressed, _, assets = _project_parts("motor_obstruction.json")

    motor = _asset_by_id(assets, "MTR-12V")
    fan = _asset_by_id(assets, "FAN-01")
    blower = _asset_by_id(assets, "BLW-01")
    psu = _asset_by_id(assets, "PSU-12V")

    assert motor.status == HMIAssetStatus.FAULT
    assert fan.status == HMIAssetStatus.WARNING
    assert blower.status == HMIAssetStatus.WARNING
    assert psu.status == HMIAssetStatus.HEALTHY
    assert "MTR_CURRENT" in motor.active_faults
    assert "FAN_RPM" in fan.downstream_impacts
    assert "BLW_AIRFLOW" in blower.downstream_impacts
    assert incident is not None


def test_voltage_sag_builds_supply_incident():
    _, _, _, _, incident, _, _, _ = _project_parts("voltage_sag.json")

    assert incident is not None
    assert incident.suspected_root_cause == CAUSE_SUPPLY_VOLTAGE_SAG
    assert incident.primary_alarms == ["PSU_VOLTAGE"]
    assert "MTR_CURRENT" in incident.secondary_symptoms
    assert "MTR_RPM" in incident.secondary_symptoms
    assert "FAN_RPM" in incident.secondary_symptoms
    assert "BLW_AIRFLOW" in incident.secondary_symptoms
    assert {"PSU-12V", "MTR-12V", "FAN-01", "BLW-01"}.issubset(set(incident.affected_assets))
    assert incident.summary == SUPPLY_SUMMARY


def test_voltage_sag_asset_states():
    _, _, _, _, incident, suppressed, _, assets = _project_parts("voltage_sag.json")

    psu = _asset_by_id(assets, "PSU-12V")
    motor = _asset_by_id(assets, "MTR-12V")
    fan = _asset_by_id(assets, "FAN-01")
    blower = _asset_by_id(assets, "BLW-01")

    assert psu.status == HMIAssetStatus.FAULT
    assert motor.status == HMIAssetStatus.WARNING
    assert fan.status == HMIAssetStatus.WARNING
    assert blower.status == HMIAssetStatus.WARNING
    assert "MTR_CURRENT" in suppressed
    assert "MTR_RPM" in suppressed
    assert incident is not None
    assert incident.suspected_root_cause != CAUSE_MOTOR_MECHANICAL_OBSTRUCTION


def test_airflow_blockage_builds_downstream_incident_without_motor_blame():
    _, _, _, _, incident, _, _, assets = _project_parts("airflow_blockage.json")

    motor = _asset_by_id(assets, "MTR-12V")
    fan = _asset_by_id(assets, "FAN-01")
    blower = _asset_by_id(assets, "BLW-01")

    assert incident is not None
    assert incident.suspected_root_cause == CAUSE_DOWNSTREAM_AIRFLOW_BLOCKAGE
    assert incident.primary_alarms == ["BLW_AIRFLOW"]
    assert incident.secondary_symptoms == []
    assert motor.status == HMIAssetStatus.HEALTHY
    assert fan.status == HMIAssetStatus.HEALTHY
    assert blower.status == HMIAssetStatus.FAULT
    assert "MTR_CURRENT" not in incident.primary_alarms
    assert "MTR_RPM" not in incident.primary_alarms
    assert incident.summary == AIRFLOW_SUMMARY


def test_missing_sensor_has_no_fake_incident():
    _, signals, data_quality, _, incident, suppressed, groups, assets = _project_parts(
        "missing_sensor.json"
    )

    assert incident is None
    assert groups == []
    assert suppressed == []
    assert "MTR_VIBRATION" in data_quality.missing_signals

    motor = _asset_by_id(assets, "MTR-12V")
    assert motor.status == HMIAssetStatus.WARNING
    assert motor.status != HMIAssetStatus.FAULT

    missing_vibration = next(signal for signal in signals if signal.signal_id == "MTR_VIBRATION")
    assert missing_vibration.status == HMISignalStatus.MISSING


def test_stale_sensor_penalizes_but_remains_deterministic():
    clean_parts = _project_parts("motor_obstruction.json")
    stale_parts = _project_parts("stale_sensor.json")

    clean_incident = clean_parts[4]
    stale_incident = stale_parts[4]
    stale_dq = stale_parts[2]

    assert stale_dq.stale_signals
    assert clean_incident is not None
    assert stale_incident is not None
    assert stale_incident.confidence < clean_incident.confidence
    assert "MTR_RPM" not in stale_incident.primary_alarms

    first_dump = stale_incident.model_dump(mode="json")
    second_dump = _project_parts("stale_sensor.json")[4].model_dump(mode="json")
    assert first_dump == second_dump


def test_incident_started_at_uses_earliest_evidence_timestamp():
    _, _, _, _, incident, _, _, _ = _project_parts("motor_obstruction.json")

    assert incident is not None
    assert incident.started_at == datetime(2026, 6, 20, 12, 0, 0, tzinfo=UTC)
    assert incident.started_at != FIXED_NOW


def test_asset_order_matches_bench_order():
    for fixture_name in [
        "healthy_motor_fan_blower.json",
        "motor_obstruction.json",
        "voltage_sag.json",
        "airflow_blockage.json",
        "missing_sensor.json",
        "stale_sensor.json",
    ]:
        bench, _, _, _, _, _, _, assets = _project_parts(fixture_name)
        assert [asset.asset_id for asset in assets] == [asset.asset_id for asset in bench.assets]


def test_no_set_order_leakage():
    first = _project_parts("motor_obstruction.json")
    second = _project_parts("motor_obstruction.json")

    assert first[4].model_dump(mode="json") == second[4].model_dump(mode="json")
    assert [group.model_dump(mode="json") for group in first[6]] == [
        group.model_dump(mode="json") for group in second[6]
    ]
    assert [asset.model_dump(mode="json") for asset in first[7]] == [
        asset.model_dump(mode="json") for asset in second[7]
    ]
    assert first[5] == second[5]