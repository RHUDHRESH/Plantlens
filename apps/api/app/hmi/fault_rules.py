"""Deterministic demo-bench fault classification for HMI root-cause candidates."""

from app.hmi.contracts import (
    DataQualityState,
    EvidenceItem,
    HMISignalStatus,
    RootCauseCandidate,
    SignalHMIState,
)
from app.hmi.status import clamp_confidence

CAUSE_MOTOR_MECHANICAL_OBSTRUCTION = "MOTOR_MECHANICAL_OBSTRUCTION"
CAUSE_SUPPLY_VOLTAGE_SAG = "SUPPLY_VOLTAGE_SAG"
CAUSE_DOWNSTREAM_AIRFLOW_BLOCKAGE = "DOWNSTREAM_AIRFLOW_BLOCKAGE"

CAUSE_PRIORITY = {
    CAUSE_SUPPLY_VOLTAGE_SAG: 1,
    CAUSE_MOTOR_MECHANICAL_OBSTRUCTION: 2,
    CAUSE_DOWNSTREAM_AIRFLOW_BLOCKAGE: 3,
}

CRITICAL_SIGNALS = (
    "PSU_VOLTAGE",
    "MTR_CURRENT",
    "MTR_RPM",
    "MTR_VIBRATION",
    "MTR_TEMP",
    "FAN_RPM",
    "BLW_AIRFLOW",
)

DOWNSTREAM_SUPPLY_SIGNALS = ("MTR_CURRENT", "MTR_RPM", "FAN_RPM", "BLW_AIRFLOW")

MOTOR_SIDE_SIGNALS = ("MTR_CURRENT", "MTR_RPM", "MTR_VIBRATION")

SIGNAL_ASSET_IDS = {
    "PSU_VOLTAGE": "PSU-12V",
    "MTR_CURRENT": "MTR-12V",
    "MTR_RPM": "MTR-12V",
    "MTR_VIBRATION": "MTR-12V",
    "MTR_TEMP": "MTR-12V",
    "FAN_RPM": "FAN-01",
    "BLW_AIRFLOW": "BLW-01",
}

EVIDENCE_DESCRIPTIONS = {
    ("MTR_CURRENT", CAUSE_MOTOR_MECHANICAL_OBSTRUCTION): "Motor current is above expected range.",
    ("MTR_RPM", CAUSE_MOTOR_MECHANICAL_OBSTRUCTION): "Motor RPM is below expected range.",
    ("MTR_VIBRATION", CAUSE_MOTOR_MECHANICAL_OBSTRUCTION): "Motor vibration is above expected range.",
    ("MTR_TEMP", CAUSE_MOTOR_MECHANICAL_OBSTRUCTION): "Motor temperature is elevated.",
    ("FAN_RPM", CAUSE_MOTOR_MECHANICAL_OBSTRUCTION): "Fan RPM is low as a downstream symptom.",
    ("BLW_AIRFLOW", CAUSE_MOTOR_MECHANICAL_OBSTRUCTION): "Blower airflow is low as a downstream symptom.",
    ("PSU_VOLTAGE", CAUSE_SUPPLY_VOLTAGE_SAG): "Supply voltage is below expected range.",
    ("MTR_CURRENT", CAUSE_SUPPLY_VOLTAGE_SAG): "Motor current is abnormal while supply voltage is low.",
    ("MTR_RPM", CAUSE_SUPPLY_VOLTAGE_SAG): "Motor RPM is low while supply voltage is low.",
    ("FAN_RPM", CAUSE_SUPPLY_VOLTAGE_SAG): "Fan RPM is low while supply voltage is low.",
    ("BLW_AIRFLOW", CAUSE_SUPPLY_VOLTAGE_SAG): "Blower airflow is low while supply voltage is low.",
    ("BLW_AIRFLOW", CAUSE_DOWNSTREAM_AIRFLOW_BLOCKAGE): "Blower airflow is below expected range.",
    ("PSU_VOLTAGE", CAUSE_DOWNSTREAM_AIRFLOW_BLOCKAGE): (
        "Supply voltage is normal, reducing likelihood of supply-side fault."
    ),
    ("MTR_CURRENT", CAUSE_DOWNSTREAM_AIRFLOW_BLOCKAGE): (
        "Motor current is normal, reducing likelihood of motor obstruction."
    ),
    ("MTR_RPM", CAUSE_DOWNSTREAM_AIRFLOW_BLOCKAGE): (
        "Motor RPM is normal, reducing likelihood of motor obstruction."
    ),
    ("FAN_RPM", CAUSE_DOWNSTREAM_AIRFLOW_BLOCKAGE): (
        "Fan RPM is normal, pointing downstream of the fan/motor."
    ),
    ("MTR_VIBRATION", CAUSE_DOWNSTREAM_AIRFLOW_BLOCKAGE): (
        "Motor vibration is normal, reducing mechanical obstruction likelihood."
    ),
}


def classify_bench_faults(
    signals: list[SignalHMIState] | dict[str, SignalHMIState],
    data_quality: DataQualityState,
) -> list[RootCauseCandidate]:
    """Classify deterministic root-cause candidates from evaluated bench signals."""
    signal_map = _as_signal_map(signals)

    if _is_healthy_no_fault(signal_map):
        return []

    if _is_missing_vibration_only_healthy(signal_map):
        return []

    if not _has_usable_fault_evidence(signal_map):
        return []

    candidates: list[RootCauseCandidate] = []
    supply_candidate = _build_supply_voltage_sag_candidate(signal_map, data_quality)
    if supply_candidate is not None:
        candidates.append(supply_candidate)

    motor_candidate = _build_motor_obstruction_candidate(signal_map, data_quality)
    if motor_candidate is not None:
        candidates.append(motor_candidate)

    airflow_candidate = _build_airflow_blockage_candidate(signal_map, data_quality)
    if airflow_candidate is not None:
        candidates.append(airflow_candidate)

    return _rank_candidates(candidates)


def _as_signal_map(
    signals: list[SignalHMIState] | dict[str, SignalHMIState],
) -> dict[str, SignalHMIState]:
    if isinstance(signals, dict):
        return dict(signals)
    return {signal.signal_id: signal for signal in signals}


def _signal(signal_map: dict[str, SignalHMIState], signal_id: str) -> SignalHMIState | None:
    return signal_map.get(signal_id)


def _is_fault(signal_map: dict[str, SignalHMIState], signal_id: str) -> bool:
    signal = _signal(signal_map, signal_id)
    return signal is not None and signal.status == HMISignalStatus.FAULT


def _is_warning(signal_map: dict[str, SignalHMIState], signal_id: str) -> bool:
    signal = _signal(signal_map, signal_id)
    return signal is not None and signal.status == HMISignalStatus.WARNING


def _is_warning_or_fault(signal_map: dict[str, SignalHMIState], signal_id: str) -> bool:
    signal = _signal(signal_map, signal_id)
    return signal is not None and signal.status in {
        HMISignalStatus.WARNING,
        HMISignalStatus.FAULT,
    }


def _is_normal(signal_map: dict[str, SignalHMIState], signal_id: str) -> bool:
    signal = _signal(signal_map, signal_id)
    return signal is not None and signal.status == HMISignalStatus.NORMAL


def _is_good_evidence(signal_map: dict[str, SignalHMIState], signal_id: str) -> bool:
    signal = _signal(signal_map, signal_id)
    return signal is not None and signal.status in {
        HMISignalStatus.NORMAL,
        HMISignalStatus.WARNING,
        HMISignalStatus.FAULT,
    }


def _is_unusable(signal_map: dict[str, SignalHMIState], signal_id: str) -> bool:
    signal = _signal(signal_map, signal_id)
    return signal is not None and signal.status in {
        HMISignalStatus.STALE,
        HMISignalStatus.MISSING,
    }


def _is_healthy_no_fault(signal_map: dict[str, SignalHMIState]) -> bool:
    return all(_is_normal(signal_map, signal_id) for signal_id in CRITICAL_SIGNALS)


def _is_missing_vibration_only_healthy(signal_map: dict[str, SignalHMIState]) -> bool:
    if not _is_unusable(signal_map, "MTR_VIBRATION"):
        return False
    other_signals = [signal_id for signal_id in CRITICAL_SIGNALS if signal_id != "MTR_VIBRATION"]
    return all(_is_normal(signal_map, signal_id) for signal_id in other_signals)


def _has_usable_fault_evidence(signal_map: dict[str, SignalHMIState]) -> bool:
    return any(
        _is_fault(signal_map, signal_id)
        for signal_id in CRITICAL_SIGNALS
        if _is_good_evidence(signal_map, signal_id)
    )


def _evidence_weight_for_status(status: HMISignalStatus) -> float:
    if status == HMISignalStatus.FAULT:
        return 1.0
    if status == HMISignalStatus.WARNING:
        return 0.5
    return 0.25


def _evidence_item(
    cause_id: str,
    signal: SignalHMIState,
    *,
    description: str,
) -> EvidenceItem:
    return EvidenceItem(
        evidence_id=f"EVD_{cause_id}_{signal.signal_id}",
        signal_id=signal.signal_id,
        asset_id=signal.asset_id,
        description=description,
        observed_value=signal.value,
        unit=signal.unit,
        status=signal.status,
        weight=_evidence_weight_for_status(signal.status),
        timestamp=signal.timestamp,
    )


def _penalize_confidence(
    base_confidence: float,
    data_quality: DataQualityState,
    *,
    extra_penalty: float = 0.0,
) -> float:
    adjusted = base_confidence - data_quality.confidence_penalty - extra_penalty
    return round(clamp_confidence(adjusted), 4)


def _rank_candidates(candidates: list[RootCauseCandidate]) -> list[RootCauseCandidate]:
    return sorted(
        candidates,
        key=lambda candidate: (
            -candidate.confidence,
            CAUSE_PRIORITY.get(candidate.cause_id, 99),
            candidate.cause_id,
        ),
    )


def _build_motor_obstruction_candidate(
    signal_map: dict[str, SignalHMIState],
    data_quality: DataQualityState,
) -> RootCauseCandidate | None:
    if not _is_fault(signal_map, "MTR_CURRENT"):
        return None

    rpm_fault = _is_fault(signal_map, "MTR_RPM")
    rpm_unusable = _is_unusable(signal_map, "MTR_RPM")
    vibration_fault = _is_fault(signal_map, "MTR_VIBRATION")
    temp_abnormal = _is_warning_or_fault(signal_map, "MTR_TEMP")
    vibration_unusable = _is_unusable(signal_map, "MTR_VIBRATION")

    if not rpm_fault and not (rpm_unusable and (vibration_fault or temp_abnormal)):
        return None

    if not (vibration_fault or temp_abnormal):
        return None

    if rpm_fault and vibration_fault:
        base_confidence = 0.90
    elif rpm_fault and temp_abnormal and vibration_unusable:
        base_confidence = 0.78
    elif rpm_fault:
        base_confidence = 0.70
    else:
        base_confidence = 0.70

    confidence = base_confidence
    if temp_abnormal:
        confidence += 0.05
    if _is_fault(signal_map, "FAN_RPM"):
        confidence += 0.03
    if _is_fault(signal_map, "BLW_AIRFLOW"):
        confidence += 0.03

    extra_penalty = 0.10 if vibration_unusable else 0.0
    confidence = _penalize_confidence(confidence, data_quality, extra_penalty=extra_penalty)

    evidence: list[EvidenceItem] = []
    for signal_id in ("MTR_CURRENT", "MTR_RPM", "MTR_VIBRATION", "MTR_TEMP", "FAN_RPM", "BLW_AIRFLOW"):
        signal = _signal(signal_map, signal_id)
        if signal is None:
            continue
        if signal_id == "MTR_VIBRATION" and vibration_unusable:
            continue
        if signal_id == "MTR_RPM" and rpm_unusable:
            continue
        if signal_id == "MTR_TEMP" and not temp_abnormal:
            continue
        if signal_id == "FAN_RPM" and not _is_fault(signal_map, signal_id):
            continue
        if signal_id == "BLW_AIRFLOW" and not _is_fault(signal_map, signal_id):
            continue
        if signal_id in {"MTR_CURRENT", "MTR_RPM", "MTR_VIBRATION"} and not _is_fault(signal_map, signal_id):
            continue

        description = EVIDENCE_DESCRIPTIONS[(signal_id, CAUSE_MOTOR_MECHANICAL_OBSTRUCTION)]
        evidence.append(_evidence_item(CAUSE_MOTOR_MECHANICAL_OBSTRUCTION, signal, description=description))

    rejected: list[str] = []
    if _is_normal(signal_map, "PSU_VOLTAGE"):
        rejected.append("SUPPLY_VOLTAGE_SAG rejected: supply voltage is normal.")
    if _is_fault(signal_map, "BLW_AIRFLOW") and (
        _is_fault(signal_map, "MTR_CURRENT") or _is_fault(signal_map, "MTR_RPM")
    ):
        rejected.append(
            "DOWNSTREAM_AIRFLOW_BLOCKAGE rejected: motor electrical/mechanical evidence is abnormal upstream."
        )
    if rpm_unusable:
        rejected.append("Motor RPM unavailable/stale; confidence reduced.")

    return RootCauseCandidate(
        cause_id=CAUSE_MOTOR_MECHANICAL_OBSTRUCTION,
        title="Motor-side mechanical obstruction",
        asset_id="MTR-12V",
        confidence=confidence,
        evidence=evidence,
        rejected_alternatives=rejected,
    )


def _build_supply_voltage_sag_candidate(
    signal_map: dict[str, SignalHMIState],
    data_quality: DataQualityState,
) -> RootCauseCandidate | None:
    if not _is_fault(signal_map, "PSU_VOLTAGE"):
        return None

    degraded_downstream = [
        signal_id
        for signal_id in DOWNSTREAM_SUPPLY_SIGNALS
        if _is_good_evidence(signal_map, signal_id) and _is_warning_or_fault(signal_map, signal_id)
    ]
    degraded_count = len(degraded_downstream)

    if degraded_count == 0:
        return None
    if degraded_count == 1:
        base_confidence = 0.70
    elif degraded_count == 2:
        base_confidence = 0.85
    else:
        base_confidence = 0.92

    confidence = base_confidence
    if _is_fault(signal_map, "MTR_RPM"):
        confidence += 0.03
    if _is_fault(signal_map, "FAN_RPM"):
        confidence += 0.03
    if _is_fault(signal_map, "BLW_AIRFLOW"):
        confidence += 0.03

    confidence = _penalize_confidence(confidence, data_quality)

    evidence: list[EvidenceItem] = []
    psu_signal = _signal(signal_map, "PSU_VOLTAGE")
    if psu_signal is not None:
        evidence.append(
            _evidence_item(
                CAUSE_SUPPLY_VOLTAGE_SAG,
                psu_signal,
                description=EVIDENCE_DESCRIPTIONS[("PSU_VOLTAGE", CAUSE_SUPPLY_VOLTAGE_SAG)],
            )
        )

    for signal_id in degraded_downstream:
        signal = _signal(signal_map, signal_id)
        if signal is None:
            continue
        evidence.append(
            _evidence_item(
                CAUSE_SUPPLY_VOLTAGE_SAG,
                signal,
                description=EVIDENCE_DESCRIPTIONS[(signal_id, CAUSE_SUPPLY_VOLTAGE_SAG)],
            )
        )

    rejected: list[str] = []
    if _is_normal(signal_map, "MTR_VIBRATION"):
        rejected.append(
            "MOTOR_MECHANICAL_OBSTRUCTION rejected: supply-side voltage is faulty and "
            "vibration does not support motor obstruction."
        )
    rejected.append(
        "DOWNSTREAM_AIRFLOW_BLOCKAGE rejected: upstream supply fault explains multiple downstream degradations."
    )

    return RootCauseCandidate(
        cause_id=CAUSE_SUPPLY_VOLTAGE_SAG,
        title="Power supply voltage sag",
        asset_id="PSU-12V",
        confidence=confidence,
        evidence=evidence,
        rejected_alternatives=rejected,
    )


def _build_airflow_blockage_candidate(
    signal_map: dict[str, SignalHMIState],
    data_quality: DataQualityState,
) -> RootCauseCandidate | None:
    if not _is_fault(signal_map, "BLW_AIRFLOW"):
        return None
    if _is_fault(signal_map, "PSU_VOLTAGE"):
        return None
    if _is_fault(signal_map, "MTR_CURRENT"):
        return None
    if _is_fault(signal_map, "MTR_RPM"):
        return None

    motor_side_warning_count = sum(
        1 for signal_id in MOTOR_SIDE_SIGNALS if _is_warning(signal_map, signal_id)
    )
    motor_side_unusable = any(_is_unusable(signal_map, signal_id) for signal_id in MOTOR_SIDE_SIGNALS)

    if (
        _is_normal(signal_map, "PSU_VOLTAGE")
        and _is_normal(signal_map, "MTR_CURRENT")
        and _is_normal(signal_map, "MTR_RPM")
    ):
        base_confidence = 0.82
    elif motor_side_warning_count >= 1:
        base_confidence = 0.74
    elif motor_side_unusable:
        base_confidence = 0.62
    else:
        base_confidence = 0.82

    confidence = base_confidence
    if _is_normal(signal_map, "FAN_RPM"):
        confidence += 0.03
    if _is_normal(signal_map, "MTR_VIBRATION"):
        confidence += 0.03

    confidence = _penalize_confidence(confidence, data_quality)

    evidence: list[EvidenceItem] = []
    for signal_id in ("BLW_AIRFLOW", "PSU_VOLTAGE", "MTR_CURRENT", "MTR_RPM", "FAN_RPM", "MTR_VIBRATION"):
        signal = _signal(signal_map, signal_id)
        if signal is None or not _is_good_evidence(signal_map, signal_id):
            continue
        if signal_id == "BLW_AIRFLOW" and not _is_fault(signal_map, signal_id):
            continue
        if signal_id != "BLW_AIRFLOW" and not (
            _is_normal(signal_map, signal_id) or _is_warning(signal_map, signal_id)
        ):
            continue
        evidence.append(
            _evidence_item(
                CAUSE_DOWNSTREAM_AIRFLOW_BLOCKAGE,
                signal,
                description=EVIDENCE_DESCRIPTIONS[(signal_id, CAUSE_DOWNSTREAM_AIRFLOW_BLOCKAGE)],
            )
        )

    rejected = [
        "MOTOR_MECHANICAL_OBSTRUCTION rejected: motor current and RPM are not faulted.",
        "SUPPLY_VOLTAGE_SAG rejected: supply voltage is normal.",
    ]

    return RootCauseCandidate(
        cause_id=CAUSE_DOWNSTREAM_AIRFLOW_BLOCKAGE,
        title="Downstream airflow restriction",
        asset_id="BLW-01",
        confidence=confidence,
        evidence=evidence,
        rejected_alternatives=rejected,
    )