"""Unit tests for HMI signal-status and data-quality evaluation."""

import json
from datetime import UTC, datetime
from pathlib import Path

from app.hmi.bench_adapter import BenchSignal, BenchSignalQuality, load_bench_payload
from app.hmi.contracts import HMISignalStatus
from app.hmi.status import (
    build_data_quality,
    confidence_after_data_quality,
    evaluate_signal_status,
    evaluate_signals,
)

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "hmi"
FIXED_NOW = datetime(2026, 6, 20, 12, 0, 5, tzinfo=UTC)
FRESH_TIMESTAMP = datetime(2026, 6, 20, 12, 0, 0, tzinfo=UTC)


def _load_fixture(name: str) -> dict:
    with (FIXTURES_DIR / name).open(encoding="utf-8") as handle:
        return json.load(handle)


def _evaluate_fixture(name: str) -> tuple[list, object]:
    payload = load_bench_payload(_load_fixture(name))
    signal_states = evaluate_signals(payload.signals, now=FIXED_NOW)
    data_quality = build_data_quality(signal_states)
    return signal_states, data_quality


def _signal_by_id(signal_states: list, signal_id: str):
    return next(state for state in signal_states if state.signal_id == signal_id)


def _bench_signal_from_payload(payload_name: str, signal_id: str) -> BenchSignal:
    payload = load_bench_payload(_load_fixture(payload_name))
    return next(signal for signal in payload.signals if signal.signal_id == signal_id)


def test_healthy_fixture_signals_are_normal():
    signal_states, data_quality = _evaluate_fixture("healthy_motor_fan_blower.json")

    for signal in signal_states:
        assert signal.status == HMISignalStatus.NORMAL
        assert signal.evidence_weight == 0.2

    assert data_quality.missing_signals == []
    assert data_quality.stale_signals == []
    assert data_quality.confidence_penalty == 0.0
    assert data_quality.notes == []


def test_motor_obstruction_fixture_marks_expected_fault_signals():
    signal_states, _ = _evaluate_fixture("motor_obstruction.json")

    expected_faults = {
        "MTR_CURRENT",
        "MTR_RPM",
        "MTR_VIBRATION",
        "MTR_TEMP",
        "FAN_RPM",
        "BLW_AIRFLOW",
    }
    for signal_id in expected_faults:
        assert _signal_by_id(signal_states, signal_id).status == HMISignalStatus.FAULT

    assert _signal_by_id(signal_states, "PSU_VOLTAGE").status == HMISignalStatus.NORMAL


def test_voltage_sag_fixture_marks_supply_and_downstream_faults():
    signal_states, _ = _evaluate_fixture("voltage_sag.json")

    expected_faults = {
        "PSU_VOLTAGE",
        "MTR_CURRENT",
        "MTR_RPM",
        "FAN_RPM",
        "BLW_AIRFLOW",
    }
    for signal_id in expected_faults:
        assert _signal_by_id(signal_states, signal_id).status == HMISignalStatus.FAULT

    assert _signal_by_id(signal_states, "MTR_VIBRATION").status == HMISignalStatus.NORMAL
    assert _signal_by_id(signal_states, "MTR_TEMP").status == HMISignalStatus.NORMAL


def test_airflow_blockage_does_not_mark_motor_faults():
    signal_states, _ = _evaluate_fixture("airflow_blockage.json")

    assert _signal_by_id(signal_states, "BLW_AIRFLOW").status == HMISignalStatus.FAULT
    assert _signal_by_id(signal_states, "PSU_VOLTAGE").status == HMISignalStatus.NORMAL
    assert _signal_by_id(signal_states, "MTR_CURRENT").status == HMISignalStatus.NORMAL
    assert _signal_by_id(signal_states, "MTR_RPM").status == HMISignalStatus.NORMAL
    assert _signal_by_id(signal_states, "MTR_VIBRATION").status == HMISignalStatus.NORMAL
    assert _signal_by_id(signal_states, "MTR_TEMP").status == HMISignalStatus.NORMAL
    assert _signal_by_id(signal_states, "FAN_RPM").status == HMISignalStatus.NORMAL


def test_stale_sensor_adds_data_quality_penalty():
    signal_states, data_quality = _evaluate_fixture("stale_sensor.json")
    mtr_rpm = _signal_by_id(signal_states, "MTR_RPM")

    assert mtr_rpm.status == HMISignalStatus.STALE
    assert mtr_rpm.evidence_weight == 0.0
    assert "MTR_RPM" in data_quality.stale_signals
    assert data_quality.confidence_penalty >= 0.15
    assert any("MTR_RPM" in note for note in data_quality.notes)


def test_missing_sensor_adds_data_quality_penalty():
    signal_states, data_quality = _evaluate_fixture("missing_sensor.json")
    mtr_vibration = _signal_by_id(signal_states, "MTR_VIBRATION")

    assert mtr_vibration.status == HMISignalStatus.MISSING
    assert mtr_vibration.evidence_weight == 0.0
    assert "MTR_VIBRATION" in data_quality.missing_signals
    assert data_quality.confidence_penalty >= 0.25
    assert any("MTR_VIBRATION" in note for note in data_quality.notes)


def test_bad_quality_is_treated_as_stale():
    signal = _bench_signal_from_payload("healthy_motor_fan_blower.json", "PSU_VOLTAGE")
    bad_signal = signal.model_copy(update={"quality": BenchSignalQuality.BAD})

    evaluated = evaluate_signal_status(bad_signal, now=FIXED_NOW)
    data_quality = build_data_quality([evaluated])

    assert evaluated.status == HMISignalStatus.STALE
    assert evaluated.evidence_weight == 0.0
    assert "PSU_VOLTAGE" in data_quality.stale_signals


def test_near_boundary_becomes_warning():
    signal = _bench_signal_from_payload("healthy_motor_fan_blower.json", "PSU_VOLTAGE")
    warning_signal = signal.model_copy(
        update={
            "value": 11.55,
            "quality": BenchSignalQuality.GOOD,
            "timestamp": FRESH_TIMESTAMP,
        }
    )

    evaluated = evaluate_signal_status(warning_signal, now=FIXED_NOW)

    assert evaluated.status == HMISignalStatus.WARNING
    assert evaluated.evidence_weight == 0.5


def test_exact_boundary_is_warning_not_fault():
    signal = _bench_signal_from_payload("healthy_motor_fan_blower.json", "PSU_VOLTAGE")
    boundary_signal = signal.model_copy(
        update={
            "value": 11.5,
            "quality": BenchSignalQuality.GOOD,
            "timestamp": FRESH_TIMESTAMP,
        }
    )

    evaluated = evaluate_signal_status(boundary_signal, now=FIXED_NOW)

    assert evaluated.status == HMISignalStatus.WARNING
    assert evaluated.status != HMISignalStatus.FAULT


def test_below_minimum_is_fault():
    signal = _bench_signal_from_payload("healthy_motor_fan_blower.json", "PSU_VOLTAGE")
    fault_signal = signal.model_copy(
        update={
            "value": 11.49,
            "quality": BenchSignalQuality.GOOD,
            "timestamp": FRESH_TIMESTAMP,
        }
    )

    evaluated = evaluate_signal_status(fault_signal, now=FIXED_NOW)

    assert evaluated.status == HMISignalStatus.FAULT


def test_above_maximum_is_fault():
    signal = _bench_signal_from_payload("healthy_motor_fan_blower.json", "MTR_CURRENT")
    fault_signal = signal.model_copy(
        update={
            "value": 1.21,
            "quality": BenchSignalQuality.GOOD,
            "timestamp": FRESH_TIMESTAMP,
        }
    )

    evaluated = evaluate_signal_status(fault_signal, now=FIXED_NOW)

    assert evaluated.status == HMISignalStatus.FAULT


def test_stale_by_age_when_quality_good():
    signal = _bench_signal_from_payload("healthy_motor_fan_blower.json", "PSU_VOLTAGE")
    aged_signal = signal.model_copy(
        update={
            "quality": BenchSignalQuality.GOOD,
            "timestamp": datetime(2026, 6, 20, 11, 59, 0, tzinfo=UTC),
        }
    )

    evaluated = evaluate_signal_status(aged_signal, now=FIXED_NOW)

    assert evaluated.status == HMISignalStatus.STALE


def test_exact_stale_threshold_is_not_stale():
    signal = _bench_signal_from_payload("healthy_motor_fan_blower.json", "PSU_VOLTAGE")
    threshold_signal = signal.model_copy(
        update={
            "quality": BenchSignalQuality.GOOD,
            "timestamp": datetime(2026, 6, 20, 12, 0, 0, tzinfo=UTC),
        }
    )
    now = datetime(2026, 6, 20, 12, 0, 5, tzinfo=UTC)

    evaluated = evaluate_signal_status(threshold_signal, now=now, stale_after_seconds=5)

    assert evaluated.status == HMISignalStatus.NORMAL


def test_non_numeric_good_signal_does_not_crash():
    signal = BenchSignal(
        signal_id="PLC_MODE",
        asset_id="PLC-IO",
        name="PLC Mode",
        value="ON",
        unit="state",
        quality=BenchSignalQuality.GOOD,
        timestamp=FRESH_TIMESTAMP,
    )

    evaluated = evaluate_signal_status(signal, now=FIXED_NOW)

    assert evaluated.status == HMISignalStatus.NORMAL
    assert evaluated.evidence_weight == 0.2


def test_confidence_after_data_quality_clamps_and_rounds():
    assert confidence_after_data_quality(0.9, _data_quality_with_penalty(0.15)) == 0.75
    assert confidence_after_data_quality(0.3, _data_quality_with_penalty(0.6)) == 0.0
    assert confidence_after_data_quality(1.2, _data_quality_with_penalty(0.15)) == 0.85
    assert confidence_after_data_quality(-0.2, _data_quality_with_penalty(0.0)) == 0.0


def test_data_quality_order_is_deterministic():
    signals = [
        _make_evaluated_signal("Z_STALE", HMISignalStatus.STALE),
        _make_evaluated_signal("B_MISSING", HMISignalStatus.MISSING),
        _make_evaluated_signal("A_STALE", HMISignalStatus.STALE),
        _make_evaluated_signal("M_MISSING", HMISignalStatus.MISSING),
    ]

    data_quality = build_data_quality(signals)

    assert data_quality.missing_signals == ["B_MISSING", "M_MISSING"]
    assert data_quality.stale_signals == ["A_STALE", "Z_STALE"]
    assert data_quality.notes == [
        "Signal B_MISSING is missing; confidence reduced.",
        "Signal M_MISSING is missing; confidence reduced.",
        "Signal A_STALE is stale or degraded; confidence reduced.",
        "Signal Z_STALE is stale or degraded; confidence reduced.",
    ]


def _data_quality_with_penalty(penalty: float):
    from app.hmi.contracts import DataQualityState

    return DataQualityState(confidence_penalty=penalty)


def _make_evaluated_signal(signal_id: str, status: HMISignalStatus):
    from app.hmi.contracts import SignalHMIState

    return SignalHMIState(
        signal_id=signal_id,
        asset_id="MTR-12V",
        name="Test Signal",
        value=1.0,
        unit="unit",
        status=status,
        evidence_weight=0.0,
    )