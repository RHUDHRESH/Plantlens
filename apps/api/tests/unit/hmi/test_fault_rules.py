"""Unit tests for deterministic HMI fault-rule classification."""

import json
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path

from app.hmi.bench_adapter import load_bench_payload
from app.hmi.contracts import HMISignalStatus, SignalHMIState
from app.hmi.fault_rules import (
    CAUSE_DOWNSTREAM_AIRFLOW_BLOCKAGE,
    CAUSE_MOTOR_MECHANICAL_OBSTRUCTION,
    CAUSE_SUPPLY_VOLTAGE_SAG,
    classify_bench_faults,
)
from app.hmi.status import build_data_quality, evaluate_signals

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "hmi"
FIXED_NOW = datetime(2026, 6, 20, 12, 0, 5, tzinfo=UTC)


def _load_fixture(name: str) -> dict:
    with (FIXTURES_DIR / name).open(encoding="utf-8") as handle:
        return json.load(handle)


def _classify_fixture(name: str):
    payload = load_bench_payload(_load_fixture(name))
    signals = evaluate_signals(payload.signals, now=FIXED_NOW)
    data_quality = build_data_quality(signals)
    candidates = classify_bench_faults(signals, data_quality)
    return candidates, signals, data_quality


def _evidence_signal_ids(candidate) -> set[str]:
    return {item.signal_id for item in candidate.evidence}


def test_healthy_fixture_returns_no_candidates():
    candidates, _, _ = _classify_fixture("healthy_motor_fan_blower.json")
    assert candidates == []


def test_motor_obstruction_returns_motor_root_cause():
    candidates, _, _ = _classify_fixture("motor_obstruction.json")

    assert candidates
    assert candidates[0].cause_id == CAUSE_MOTOR_MECHANICAL_OBSTRUCTION
    assert candidates[0].asset_id == "MTR-12V"
    assert candidates[0].confidence >= 0.85

    evidence_ids = _evidence_signal_ids(candidates[0])
    assert "MTR_CURRENT" in evidence_ids
    assert "MTR_RPM" in evidence_ids
    assert "MTR_VIBRATION" in evidence_ids
    assert "BLW_AIRFLOW" in evidence_ids
    assert any("SUPPLY_VOLTAGE_SAG rejected" in item for item in candidates[0].rejected_alternatives)


def test_voltage_sag_returns_supply_root_cause():
    candidates, _, _ = _classify_fixture("voltage_sag.json")

    assert candidates
    assert candidates[0].cause_id == CAUSE_SUPPLY_VOLTAGE_SAG
    assert candidates[0].asset_id == "PSU-12V"

    evidence_ids = _evidence_signal_ids(candidates[0])
    assert "PSU_VOLTAGE" in evidence_ids
    downstream = {"MTR_CURRENT", "MTR_RPM", "FAN_RPM", "BLW_AIRFLOW"}
    assert len(evidence_ids.intersection(downstream)) >= 2

    motor_candidates = [
        candidate for candidate in candidates if candidate.cause_id == CAUSE_MOTOR_MECHANICAL_OBSTRUCTION
    ]
    if motor_candidates:
        assert candidates[0].confidence >= motor_candidates[0].confidence

    rejected_text = " ".join(candidates[0].rejected_alternatives)
    assert (
        "MOTOR_MECHANICAL_OBSTRUCTION rejected" in rejected_text
        or "DOWNSTREAM_AIRFLOW_BLOCKAGE rejected" in rejected_text
    )


def test_airflow_blockage_returns_downstream_root_cause():
    candidates, _, _ = _classify_fixture("airflow_blockage.json")

    assert candidates
    assert candidates[0].cause_id == CAUSE_DOWNSTREAM_AIRFLOW_BLOCKAGE
    assert candidates[0].asset_id == "BLW-01"

    evidence_ids = _evidence_signal_ids(candidates[0])
    assert "BLW_AIRFLOW" in evidence_ids
    assert "MTR_CURRENT" in evidence_ids
    assert "MTR_RPM" in evidence_ids
    assert any(
        "MOTOR_MECHANICAL_OBSTRUCTION rejected" in item
        for item in candidates[0].rejected_alternatives
    )
    assert all(
        candidate.cause_id == CAUSE_DOWNSTREAM_AIRFLOW_BLOCKAGE or candidate.confidence < candidates[0].confidence
        for candidate in candidates[1:]
    )


def test_airflow_blockage_does_not_blame_motor():
    candidates, _, _ = _classify_fixture("airflow_blockage.json")

    airflow = next(
        candidate for candidate in candidates if candidate.cause_id == CAUSE_DOWNSTREAM_AIRFLOW_BLOCKAGE
    )
    motor_candidates = [
        candidate for candidate in candidates if candidate.cause_id == CAUSE_MOTOR_MECHANICAL_OBSTRUCTION
    ]

    for motor_candidate in motor_candidates:
        assert motor_candidate.confidence < airflow.confidence
    assert not motor_candidates


def test_stale_sensor_reduces_confidence():
    clean_candidates, _, _ = _classify_fixture("motor_obstruction.json")
    stale_candidates, stale_signals, stale_dq = _classify_fixture("stale_sensor.json")

    clean_motor = next(
        candidate for candidate in clean_candidates if candidate.cause_id == CAUSE_MOTOR_MECHANICAL_OBSTRUCTION
    )
    stale_motor = next(
        candidate for candidate in stale_candidates if candidate.cause_id == CAUSE_MOTOR_MECHANICAL_OBSTRUCTION
    )

    assert clean_motor.confidence > stale_motor.confidence
    assert stale_dq.confidence_penalty > 0
    assert "MTR_RPM" not in _evidence_signal_ids(stale_motor)
    assert stale_motor.confidence <= 0.8

    stale_rpm = next(signal for signal in stale_signals if signal.signal_id == "MTR_RPM")
    assert stale_rpm.status == HMISignalStatus.STALE


def test_missing_sensor_does_not_invent_root_cause():
    candidates, signals, _ = _classify_fixture("missing_sensor.json")

    assert candidates == []

    missing_vibration = next(signal for signal in signals if signal.signal_id == "MTR_VIBRATION")
    assert missing_vibration.status == HMISignalStatus.MISSING


def test_confidence_never_exceeds_one_or_below_zero():
    fixtures = [
        "motor_obstruction.json",
        "voltage_sag.json",
        "airflow_blockage.json",
        "stale_sensor.json",
    ]
    for fixture_name in fixtures:
        candidates, _, _ = _classify_fixture(fixture_name)
        for candidate in candidates:
            assert 0.0 <= candidate.confidence <= 1.0


def test_candidate_order_is_deterministic():
    first, _, _ = _classify_fixture("voltage_sag.json")
    second, _, _ = _classify_fixture("voltage_sag.json")

    assert [candidate.model_dump(mode="json") for candidate in first] == [
        candidate.model_dump(mode="json") for candidate in second
    ]


def test_tie_breaker_prefers_supply_over_motor():
    payload = load_bench_payload(_load_fixture("voltage_sag.json"))
    signals = evaluate_signals(payload.signals, now=FIXED_NOW)
    signal_map = {signal.signal_id: signal for signal in signals}

    motor_like_signals = evaluate_signals(
        load_bench_payload(_load_fixture("motor_obstruction.json")).signals,
        now=FIXED_NOW,
    )
    motor_map = {signal.signal_id: signal for signal in motor_like_signals}

    tied_signals = deepcopy(signal_map)
    tied_signals["MTR_CURRENT"] = motor_map["MTR_CURRENT"]
    tied_signals["MTR_RPM"] = motor_map["MTR_RPM"]
    tied_signals["MTR_VIBRATION"] = motor_map["MTR_VIBRATION"]
    tied_signals["MTR_TEMP"] = motor_map["MTR_TEMP"]

    data_quality = build_data_quality(list(tied_signals.values()))
    candidates = classify_bench_faults(tied_signals, data_quality)

    supply = next(candidate for candidate in candidates if candidate.cause_id == CAUSE_SUPPLY_VOLTAGE_SAG)
    motor = next(
        candidate for candidate in candidates if candidate.cause_id == CAUSE_MOTOR_MECHANICAL_OBSTRUCTION
    )

    tied_supply = supply.model_copy(update={"confidence": motor.confidence})
    tied_motor = motor.model_copy(update={"confidence": motor.confidence})
    ranked = sorted(
        [tied_supply, tied_motor],
        key=lambda candidate: (
            -candidate.confidence,
            {CAUSE_SUPPLY_VOLTAGE_SAG: 1, CAUSE_MOTOR_MECHANICAL_OBSTRUCTION: 2}[candidate.cause_id],
            candidate.cause_id,
        ),
    )
    assert ranked[0].cause_id == CAUSE_SUPPLY_VOLTAGE_SAG
    assert candidates[0].cause_id == CAUSE_SUPPLY_VOLTAGE_SAG


def test_unknown_extra_signal_is_ignored_safely():
    baseline_candidates, signals, data_quality = _classify_fixture("voltage_sag.json")
    extra_signal = SignalHMIState(
        signal_id="UNUSED_SIGNAL",
        asset_id="PLC-IO",
        name="Unused",
        value=1.0,
        unit="unit",
        status=HMISignalStatus.NORMAL,
        evidence_weight=0.2,
    )
    extended = list(signals) + [extra_signal]
    candidates = classify_bench_faults(extended, data_quality)

    assert [candidate.model_dump(mode="json") for candidate in candidates] == [
        candidate.model_dump(mode="json") for candidate in baseline_candidates
    ]


def test_missing_required_signal_does_not_crash():
    candidates, signals, data_quality = _classify_fixture("motor_obstruction.json")
    baseline_confidence = candidates[0].confidence

    signal_map = {signal.signal_id: signal for signal in signals}
    reduced_map = {signal_id: signal for signal_id, signal in signal_map.items() if signal_id != "MTR_VIBRATION"}
    reduced_candidates = classify_bench_faults(reduced_map, data_quality)

    assert reduced_candidates
    assert reduced_candidates[0].confidence < baseline_confidence
    assert "MTR_VIBRATION" not in _evidence_signal_ids(reduced_candidates[0])

    fan_removed_map = {signal_id: signal for signal_id, signal in signal_map.items() if signal_id != "FAN_RPM"}
    fan_removed_candidates = classify_bench_faults(fan_removed_map, data_quality)
    assert fan_removed_candidates