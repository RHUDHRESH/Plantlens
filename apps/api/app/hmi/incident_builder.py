"""Deterministic HMI incident projection from ranked root-cause candidates."""

from datetime import datetime

from app.hmi.bench_adapter import BenchPayload
from app.hmi.contracts import (
    AlarmGroup,
    AssetHMIState,
    DataQualityState,
    EvidenceItem,
    HMIAssetStatus,
    HMISeverity,
    HMISignalStatus,
    IncidentHMIState,
    RootCauseCandidate,
    SignalHMIState,
)
from app.hmi.fault_rules import (
    CAUSE_DOWNSTREAM_AIRFLOW_BLOCKAGE,
    CAUSE_MOTOR_MECHANICAL_OBSTRUCTION,
    CAUSE_SUPPLY_VOLTAGE_SAG,
    SIGNAL_ASSET_IDS,
)
from app.hmi.status import clamp_confidence

SUMMARY_BY_CAUSE = {
    CAUSE_MOTOR_MECHANICAL_OBSTRUCTION: (
        "Motor-side evidence points to mechanical obstruction; downstream fan and blower "
        "symptoms are grouped under the motor incident."
    ),
    CAUSE_SUPPLY_VOLTAGE_SAG: (
        "Supply voltage is below range and multiple downstream assets degraded together, "
        "pointing to a power supply issue."
    ),
    CAUSE_DOWNSTREAM_AIRFLOW_BLOCKAGE: (
        "Airflow is low while supply and motor evidence remain normal, pointing to a "
        "downstream airflow restriction."
    ),
}

ALARM_GROUP_TITLE_BY_CAUSE = {
    CAUSE_MOTOR_MECHANICAL_OBSTRUCTION: "Motor obstruction alarm group",
    CAUSE_SUPPLY_VOLTAGE_SAG: "Supply voltage sag alarm group",
    CAUSE_DOWNSTREAM_AIRFLOW_BLOCKAGE: "Airflow restriction alarm group",
}

PRIMARY_ORDER_BY_CAUSE = {
    CAUSE_MOTOR_MECHANICAL_OBSTRUCTION: (
        "MTR_CURRENT",
        "MTR_RPM",
        "MTR_VIBRATION",
        "MTR_TEMP",
    ),
    CAUSE_SUPPLY_VOLTAGE_SAG: ("PSU_VOLTAGE",),
    CAUSE_DOWNSTREAM_AIRFLOW_BLOCKAGE: ("BLW_AIRFLOW",),
}

SECONDARY_ORDER_BY_CAUSE = {
    CAUSE_MOTOR_MECHANICAL_OBSTRUCTION: ("FAN_RPM", "BLW_AIRFLOW"),
    CAUSE_SUPPLY_VOLTAGE_SAG: ("MTR_CURRENT", "MTR_RPM", "FAN_RPM", "BLW_AIRFLOW"),
    CAUSE_DOWNSTREAM_AIRFLOW_BLOCKAGE: ("FAN_RPM",),
}

SUPPRESSED_ORDER_BY_CAUSE = {
    CAUSE_MOTOR_MECHANICAL_OBSTRUCTION: ("FAN_RPM", "BLW_AIRFLOW"),
    CAUSE_SUPPLY_VOLTAGE_SAG: ("MTR_CURRENT", "MTR_RPM", "FAN_RPM", "BLW_AIRFLOW"),
    CAUSE_DOWNSTREAM_AIRFLOW_BLOCKAGE: (),
}

HEALTH_SCORE_BY_STATUS = {
    HMIAssetStatus.HEALTHY: 100.0,
    HMIAssetStatus.WARNING: 70.0,
    HMIAssetStatus.FAULT: 35.0,
    HMIAssetStatus.OFFLINE: 0.0,
}

ROOT_ASSET_BY_CAUSE = {
    CAUSE_MOTOR_MECHANICAL_OBSTRUCTION: "MTR-12V",
    CAUSE_SUPPLY_VOLTAGE_SAG: "PSU-12V",
    CAUSE_DOWNSTREAM_AIRFLOW_BLOCKAGE: "BLW-01",
}


def build_hmi_incident(
    *,
    bench: BenchPayload,
    signals: list[SignalHMIState],
    candidates: list[RootCauseCandidate],
    data_quality: DataQualityState,
    now: datetime,
) -> IncidentHMIState | None:
    """Build one active HMI incident from the top root-cause candidate."""
    if not candidates:
        return None

    candidate = candidates[0]
    signal_map = _signal_map(signals)
    cause_id = candidate.cause_id

    primary_alarms = _primary_signal_ids(candidate, signal_map)
    secondary_symptoms = _secondary_signal_ids(candidate.cause_id, signal_map, primary_alarms)
    evidence = _sort_evidence(candidate.evidence, primary_alarms, secondary_symptoms)
    affected_assets = _affected_asset_ids(
        bench=bench,
        root_asset_id=candidate.asset_id,
        primary_alarms=primary_alarms,
        secondary_symptoms=secondary_symptoms,
    )

    return IncidentHMIState(
        incident_id=f"INC_{cause_id}",
        severity=_incident_severity(candidate, data_quality, primary_alarms, signal_map),
        title=candidate.title,
        summary=_incident_summary(cause_id),
        suspected_root_cause=cause_id,
        confidence=candidate.confidence,
        started_at=_incident_started_at(evidence, now),
        affected_assets=affected_assets,
        primary_alarms=primary_alarms,
        secondary_symptoms=secondary_symptoms,
        evidence=evidence,
    )


def build_alarm_groups(
    *,
    incident: IncidentHMIState | None,
    signals: list[SignalHMIState],
    candidates: list[RootCauseCandidate],
) -> list[AlarmGroup]:
    """Collapse alarm flood into one deterministic alarm group per incident."""
    if incident is None:
        return []

    signal_map = _signal_map(signals)
    suppressed = build_suppressed_symptoms(incident=incident, signals=signals)
    grouped_alarms = _unique_in_order(
        [
            signal_id
            for signal_id in incident.primary_alarms + incident.secondary_symptoms
            if _is_abnormal_usable(signal_map, signal_id)
        ]
    )

    root_alarm = incident.primary_alarms[0] if incident.primary_alarms else None
    if root_alarm is None and incident.evidence:
        root_alarm = incident.evidence[0].signal_id

    return [
        AlarmGroup(
            group_id=f"AG_{incident.suspected_root_cause}",
            title=ALARM_GROUP_TITLE_BY_CAUSE.get(
                incident.suspected_root_cause,
                "PlantLens alarm group",
            ),
            severity=incident.severity,
            root_alarm=root_alarm,
            grouped_alarms=grouped_alarms,
            suppressed_duplicates=suppressed,
        )
    ]


def build_suppressed_symptoms(
    *,
    incident: IncidentHMIState | None,
    signals: list[SignalHMIState],
) -> list[str]:
    """Return downstream symptom signal IDs suppressed under the root incident."""
    if incident is None:
        return []

    signal_map = _signal_map(signals)
    cause_id = incident.suspected_root_cause
    suppressed_order = SUPPRESSED_ORDER_BY_CAUSE.get(cause_id, ())

    return [
        signal_id
        for signal_id in suppressed_order
        if _is_warning_or_fault(signal_map, signal_id)
        and signal_id not in incident.primary_alarms
    ]


def build_asset_states(
    *,
    bench: BenchPayload,
    signals: list[SignalHMIState],
    incident: IncidentHMIState | None,
    suppressed_symptoms: list[str],
    data_quality: DataQualityState,
) -> list[AssetHMIState]:
    """Build per-asset HMI states ordered exactly as bench.assets."""
    signal_map = _signal_map(signals)
    signals_by_asset = _signals_by_asset(bench, signal_map)
    root_asset_id = (
        ROOT_ASSET_BY_CAUSE.get(incident.suspected_root_cause) if incident is not None else None
    )
    primary_alarms = set(incident.primary_alarms) if incident else set()
    suppressed_set = set(suppressed_symptoms)

    asset_states: list[AssetHMIState] = []
    for bench_asset in bench.assets:
        asset_signals = signals_by_asset.get(bench_asset.asset_id, [])
        asset_signal_ids = [signal.signal_id for signal in asset_signals]
        asset_primary_alarms = [
            signal_id for signal_id in asset_signal_ids if signal_id in primary_alarms
        ]
        asset_suppressed = [
            signal_id for signal_id in asset_signal_ids if signal_id in suppressed_set
        ]

        status = _asset_status_from_signals(
            asset_id=bench_asset.asset_id,
            asset_signals=asset_signals,
            incident=incident,
            root_asset_id=root_asset_id,
            primary_alarms=primary_alarms,
            suppressed_symptoms=suppressed_set,
        )
        health_score = _health_score(
            status=status,
            asset_signals=asset_signals,
            data_quality=data_quality,
        )

        asset_states.append(
            AssetHMIState(
                asset_id=bench_asset.asset_id,
                name=bench_asset.name,
                kind=bench_asset.kind,
                status=status,
                health_score=health_score,
                primary_signals=asset_signal_ids,
                active_faults=asset_primary_alarms,
                downstream_impacts=asset_suppressed,
            )
        )

    return asset_states


def _signal_map(signals: list[SignalHMIState]) -> dict[str, SignalHMIState]:
    return {signal.signal_id: signal for signal in signals}


def _signals_by_asset(
    bench: BenchPayload,
    signal_map: dict[str, SignalHMIState],
) -> dict[str, list[SignalHMIState]]:
    by_asset: dict[str, list[SignalHMIState]] = {asset.asset_id: [] for asset in bench.assets}
    for bench_signal in bench.signals:
        signal = signal_map.get(bench_signal.signal_id)
        if signal is not None:
            by_asset.setdefault(signal.asset_id, []).append(signal)
    return by_asset


def _is_warning_or_fault(signal_map: dict[str, SignalHMIState], signal_id: str) -> bool:
    signal = signal_map.get(signal_id)
    return signal is not None and signal.status in {
        HMISignalStatus.WARNING,
        HMISignalStatus.FAULT,
    }


def _is_abnormal_usable(signal_map: dict[str, SignalHMIState], signal_id: str) -> bool:
    return _is_warning_or_fault(signal_map, signal_id)


def _has_process_fault(asset_signals: list[SignalHMIState]) -> bool:
    return any(signal.status == HMISignalStatus.FAULT for signal in asset_signals)


def _primary_signal_ids(
    candidate: RootCauseCandidate,
    signal_map: dict[str, SignalHMIState],
) -> list[str]:
    cause_id = candidate.cause_id
    evidence_ids = {item.signal_id for item in candidate.evidence}
    primary_order = PRIMARY_ORDER_BY_CAUSE.get(cause_id, ())

    primary: list[str] = []
    for signal_id in primary_order:
        if signal_id == "MTR_TEMP" and cause_id == CAUSE_MOTOR_MECHANICAL_OBSTRUCTION:
            if signal_id not in evidence_ids:
                continue
            if not _is_warning_or_fault(signal_map, signal_id):
                continue
        if cause_id == CAUSE_DOWNSTREAM_AIRFLOW_BLOCKAGE:
            if signal_id == "BLW_AIRFLOW" and _is_warning_or_fault(signal_map, signal_id):
                primary.append(signal_id)
            continue
        if cause_id == CAUSE_SUPPLY_VOLTAGE_SAG:
            if signal_id == "PSU_VOLTAGE" and _is_warning_or_fault(signal_map, signal_id):
                primary.append(signal_id)
            continue
        if cause_id == CAUSE_MOTOR_MECHANICAL_OBSTRUCTION:
            if _is_warning_or_fault(signal_map, signal_id):
                primary.append(signal_id)
    return primary


def _secondary_signal_ids(
    cause_id: str,
    signal_map: dict[str, SignalHMIState],
    primary_alarms: list[str],
) -> list[str]:
    primary_set = set(primary_alarms)
    secondary_order = SECONDARY_ORDER_BY_CAUSE.get(cause_id, ())
    return [
        signal_id
        for signal_id in secondary_order
        if signal_id not in primary_set and _is_warning_or_fault(signal_map, signal_id)
    ]


def _affected_asset_ids(
    *,
    bench: BenchPayload,
    root_asset_id: str,
    primary_alarms: list[str],
    secondary_symptoms: list[str],
) -> list[str]:
    referenced_assets: set[str] = {root_asset_id}
    for signal_id in primary_alarms + secondary_symptoms:
        asset_id = SIGNAL_ASSET_IDS.get(signal_id)
        if asset_id is not None:
            referenced_assets.add(asset_id)

    return [asset.asset_id for asset in bench.assets if asset.asset_id in referenced_assets]


def _sort_evidence(
    evidence: list[EvidenceItem],
    primary_alarms: list[str],
    secondary_symptoms: list[str],
) -> list[EvidenceItem]:
    primary_rank = {signal_id: index for index, signal_id in enumerate(primary_alarms)}
    secondary_rank = {signal_id: index for index, signal_id in enumerate(secondary_symptoms)}

    def sort_key(item: EvidenceItem) -> tuple[int, int, str]:
        if item.signal_id in primary_rank:
            return (0, primary_rank[item.signal_id], item.signal_id)
        if item.signal_id in secondary_rank:
            return (1, secondary_rank[item.signal_id], item.signal_id)
        return (2, 0, item.signal_id)

    return sorted(evidence, key=sort_key)


def _incident_summary(cause_id: str) -> str:
    return SUMMARY_BY_CAUSE.get(
        cause_id,
        "PlantLens grouped abnormal signals into one deterministic incident.",
    )


def _incident_started_at(evidence: list[EvidenceItem], now: datetime) -> datetime:
    timestamps = [item.timestamp for item in evidence if item.timestamp is not None]
    if not timestamps:
        return now
    return min(timestamps)


def _has_strong_root_evidence(
    primary_alarms: list[str],
    signal_map: dict[str, SignalHMIState],
) -> bool:
    return any(
        signal_map.get(signal_id) is not None
        and signal_map[signal_id].status == HMISignalStatus.FAULT
        for signal_id in primary_alarms
    )


def _incident_severity(
    candidate: RootCauseCandidate,
    data_quality: DataQualityState,
    primary_alarms: list[str],
    signal_map: dict[str, SignalHMIState],
) -> HMISeverity:
    if candidate.confidence >= 0.75:
        severity = HMISeverity.CRITICAL
    else:
        severity = HMISeverity.WARNING

    if data_quality.confidence_penalty >= 0.4 and not _has_strong_root_evidence(
        primary_alarms, signal_map
    ):
        severity = HMISeverity.WARNING

    return severity


def _asset_status_from_signals(
    *,
    asset_id: str,
    asset_signals: list[SignalHMIState],
    incident: IncidentHMIState | None,
    root_asset_id: str | None,
    primary_alarms: set[str],
    suppressed_symptoms: set[str],
) -> HMIAssetStatus:
    if not asset_signals:
        return HMIAssetStatus.HEALTHY

    if all(signal.status == HMISignalStatus.MISSING for signal in asset_signals):
        return HMIAssetStatus.OFFLINE

    has_missing_or_stale = any(
        signal.status in {HMISignalStatus.MISSING, HMISignalStatus.STALE}
        for signal in asset_signals
    )
    has_process_fault = _has_process_fault(asset_signals)
    asset_primary = [
        signal.signal_id for signal in asset_signals if signal.signal_id in primary_alarms
    ]
    asset_suppressed = [
        signal.signal_id for signal in asset_signals if signal.signal_id in suppressed_symptoms
    ]

    if incident is not None and root_asset_id == asset_id:
        return HMIAssetStatus.FAULT

    if asset_primary:
        return HMIAssetStatus.FAULT

    if has_missing_or_stale and not has_process_fault:
        return HMIAssetStatus.WARNING

    if asset_suppressed:
        return HMIAssetStatus.WARNING

    for signal in asset_signals:
        if signal.signal_id in suppressed_symptoms:
            continue
        if signal.status == HMISignalStatus.FAULT:
            return HMIAssetStatus.FAULT
        if signal.status == HMISignalStatus.WARNING:
            return HMIAssetStatus.WARNING

    return HMIAssetStatus.HEALTHY


def _health_score(
    *,
    status: HMIAssetStatus,
    asset_signals: list[SignalHMIState],
    data_quality: DataQualityState,
) -> float:
    score = HEALTH_SCORE_BY_STATUS[status]
    degraded_signal_ids = set(data_quality.missing_signals) | set(data_quality.stale_signals)
    if any(signal.signal_id in degraded_signal_ids for signal in asset_signals):
        score -= data_quality.confidence_penalty * 100.0
    return round(clamp_confidence(score / 100.0) * 100.0, 2)


def _unique_in_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            ordered.append(item)
    return ordered