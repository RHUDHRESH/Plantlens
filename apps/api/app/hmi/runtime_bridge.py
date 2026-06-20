"""Runtime snapshot to PlantHMIState projection bridge."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from app.hmi.contracts import (
    AlarmGroup,
    AssetHMIState,
    CausalityEdgeHMI,
    DataQualityState,
    EvidenceItem,
    HMIAssetStatus,
    HMIOverallStatus,
    HMISeverity,
    HMISignalStatus,
    IncidentHMIState,
    OperatorAction,
    PlantHMIState,
    SafetyLevel,
    SignalHMIState,
)
from app.hmi.incident_builder import HEALTH_SCORE_BY_STATUS
from app.hmi.operator_actions import DATA_QUALITY_ACTION
from app.hmi.status import build_data_quality, clamp_confidence

if TYPE_CHECKING:
    from app.runtime.runtime_state import RuntimeState

NOTE_COMPILED_UNAVAILABLE = (
    "Compiled bundle unavailable; HMI rendered from runtime snapshot only."
)
NOTE_COMPILED_NO_ASSETS = (
    "Compiled bundle did not include usable asset metadata; "
    "inferred assets from runtime snapshot."
)
NOTE_COMPILED_NO_EDGES = (
    "Compiled bundle did not include usable causality edges."
)
NOTE_NO_TAGS = "Runtime snapshot contains no tags."

_NORMAL_WEIGHT = 0.2
_WARNING_WEIGHT = 0.5
_FAULT_WEIGHT = 1.0
_ZERO_WEIGHT = 0.0

_RUNTIME_ASSET_STATUS_MAP = {
    "normal": HMIAssetStatus.HEALTHY,
    "warning": HMIAssetStatus.WARNING,
    "critical": HMIAssetStatus.FAULT,
    "sensor_bad": HMIAssetStatus.WARNING,
    "offline": HMIAssetStatus.OFFLINE,
    "unknown": HMIAssetStatus.WARNING,
}

_SEVERITY_MAP = {
    "critical": HMISeverity.CRITICAL,
    "warning": HMISeverity.WARNING,
    "info": HMISeverity.INFO,
}

_CONFIDENCE_STRING_MAP = {
    "high": 0.85,
    "medium": 0.6,
    "low": 0.3,
}


def build_hmi_state_from_runtime_snapshot(
    *,
    plant_id: str,
    run_id: str,
    runtime_snapshot: dict,
    compiled_bundle: dict | None = None,
    now: datetime | None = None,
) -> PlantHMIState:
    """Project a runtime snapshot dict into a frontend-ready PlantHMIState."""
    generated_at = _resolve_generated_at(now)
    _validate_runtime_snapshot(runtime_snapshot)

    tags = runtime_snapshot.get("tags") or {}
    active_alarms = runtime_snapshot.get("active_alarms") or []
    active_situations = runtime_snapshot.get("active_situations") or []
    latest_calm_card = runtime_snapshot.get("latest_calm_card")
    asset_status_raw = runtime_snapshot.get("asset_status") or {}

    bridge_notes = _compiled_bundle_notes(compiled_bundle)
    asset_metadata, assets_from_compiled = _extract_assets(compiled_bundle, tags, asset_status_raw)
    edge_metadata, edges_from_compiled = _extract_causality_edges(compiled_bundle)

    if compiled_bundle is not None and not assets_from_compiled:
        bridge_notes.append(NOTE_COMPILED_NO_ASSETS)
    if compiled_bundle is not None and not edges_from_compiled:
        bridge_notes.append(NOTE_COMPILED_NO_EDGES)

    alarms_by_tag = _alarms_by_tag(active_alarms)
    signal_states = _build_signal_states(
        tags,
        alarms_by_tag=alarms_by_tag,
        asset_metadata=asset_metadata,
    )
    data_quality = _build_runtime_data_quality(signal_states, bridge_notes, tags)

    situation = _select_situation(active_situations)
    incident = (
        _build_incident_from_situation(situation, generated_at=generated_at)
        if situation is not None
        else None
    )

    alarm_groups = _build_runtime_alarm_groups(incident)
    suppressed_symptoms = incident.secondary_symptoms if incident is not None else []
    causality_edges = _build_causality_edges(edge_metadata, incident)
    assets = _build_asset_states(
        asset_metadata=asset_metadata,
        signal_states=signal_states,
        active_alarms=active_alarms,
        asset_status_raw=asset_status_raw,
        incident=incident,
        data_quality=data_quality,
    )
    operator_actions = _build_runtime_operator_actions(
        incident=incident,
        latest_calm_card=latest_calm_card,
        data_quality=data_quality,
    )
    overall_status = _derive_runtime_overall_status(
        incident=incident,
        assets=assets,
        data_quality=data_quality,
        has_tags=bool(tags),
    )

    return PlantHMIState(
        plant_id=plant_id,
        run_id=run_id,
        generated_at=generated_at,
        overall_status=overall_status,
        active_incident=incident,
        assets=assets,
        signals=signal_states,
        causality_edges=causality_edges,
        root_cause_candidates=[],
        operator_actions=operator_actions,
        alarm_groups=alarm_groups,
        suppressed_symptoms=suppressed_symptoms,
        data_quality=data_quality,
    )


def build_hmi_state_from_runtime_state(
    *,
    plant_id: str,
    run_id: str,
    state: RuntimeState,
    compiled_bundle: dict | None = None,
    now: datetime | None = None,
) -> PlantHMIState:
    """Project a RuntimeState instance via its snapshot()."""
    return build_hmi_state_from_runtime_snapshot(
        plant_id=plant_id,
        run_id=run_id,
        runtime_snapshot=state.snapshot(),
        compiled_bundle=compiled_bundle,
        now=now,
    )


def _validate_runtime_snapshot(runtime_snapshot: dict) -> None:
    if not isinstance(runtime_snapshot, dict):
        raise ValueError("runtime_snapshot must be a mapping")

    tags = runtime_snapshot.get("tags", {})
    if tags is None:
        tags = {}
    if not isinstance(tags, dict):
        raise ValueError("runtime_snapshot.tags must be a mapping")

    active_alarms = runtime_snapshot.get("active_alarms", [])
    if active_alarms is None:
        active_alarms = []
    if not isinstance(active_alarms, list):
        raise ValueError("runtime_snapshot.active_alarms must be a list")

    active_situations = runtime_snapshot.get("active_situations", [])
    if active_situations is None:
        active_situations = []
    if not isinstance(active_situations, list):
        raise ValueError("runtime_snapshot.active_situations must be a list")

    asset_status = runtime_snapshot.get("asset_status", {})
    if asset_status is None:
        asset_status = {}
    if not isinstance(asset_status, dict):
        raise ValueError("runtime_snapshot.asset_status must be a mapping")


def _resolve_generated_at(now: datetime | None) -> datetime:
    if now is None:
        return datetime.now(UTC)
    if now.tzinfo is None:
        return now.replace(tzinfo=UTC)
    return now


def _compiled_bundle_notes(compiled_bundle: dict | None) -> list[str]:
    if compiled_bundle is None:
        return [NOTE_COMPILED_UNAVAILABLE]
    return []


def _extract_assets(
    compiled_bundle: dict | None,
    tags: dict[str, Any],
    asset_status: dict[str, str],
) -> tuple[list[dict[str, str]], bool]:
    if compiled_bundle is None:
        return _infer_assets(tags, asset_status), False

    raw_assets: list[Any] | None = None
    if isinstance(compiled_bundle.get("assets"), list):
        raw_assets = compiled_bundle["assets"]
    elif isinstance(compiled_bundle.get("plant"), dict) and isinstance(
        compiled_bundle["plant"].get("assets"), list
    ):
        raw_assets = compiled_bundle["plant"]["assets"]
    elif isinstance(compiled_bundle.get("asset_index"), dict):
        raw_assets = [
            {"asset_id": asset_id, **asset_data}
            for asset_id, asset_data in compiled_bundle["asset_index"].items()
            if isinstance(asset_data, dict)
        ]

    if not raw_assets:
        return _infer_assets(tags, asset_status), False

    assets: list[dict[str, str]] = []
    for entry in raw_assets:
        if not isinstance(entry, dict):
            continue
        asset_id = _first_str(entry, "asset_id", "id")
        if asset_id is None and isinstance(entry.get("asset_id"), str):
            asset_id = entry["asset_id"]
        if asset_id is None:
            continue
        assets.append(
            {
                "asset_id": asset_id,
                "name": _first_str(entry, "name", "display_name", "label") or asset_id,
                "kind": _first_str(entry, "kind", "type", "asset_type") or "unknown",
            }
        )

    if not assets:
        return _infer_assets(tags, asset_status), False
    return assets, True


def _infer_assets(
    tags: dict[str, Any],
    asset_status: dict[str, str],
) -> list[dict[str, str]]:
    ordered_ids: list[str] = []
    seen: set[str] = set()

    for tag in tags.values():
        if not isinstance(tag, dict):
            continue
        asset_id = tag.get("asset_id")
        if isinstance(asset_id, str) and asset_id not in seen:
            seen.add(asset_id)
            ordered_ids.append(asset_id)

    for asset_id in asset_status:
        if asset_id not in seen:
            seen.add(asset_id)
            ordered_ids.append(asset_id)

    if not ordered_ids:
        ordered_ids = sorted(seen)

    return [
        {"asset_id": asset_id, "name": asset_id, "kind": "unknown"}
        for asset_id in ordered_ids
    ]


def _extract_causality_edges(
    compiled_bundle: dict | None,
) -> tuple[list[dict[str, str]], bool]:
    if compiled_bundle is None:
        return [], False

    raw_edges: list[Any] | None = None
    graph_index = compiled_bundle.get("graph_index")
    if isinstance(graph_index, dict) and isinstance(graph_index.get("approved_edges"), list):
        raw_edges = graph_index["approved_edges"]
    elif isinstance(compiled_bundle.get("causality_edges"), list):
        raw_edges = compiled_bundle["causality_edges"]
    elif isinstance(compiled_bundle.get("causal_graph"), dict) and isinstance(
        compiled_bundle["causal_graph"].get("edges"), list
    ):
        raw_edges = compiled_bundle["causal_graph"]["edges"]
    elif isinstance(compiled_bundle.get("graph"), dict) and isinstance(
        compiled_bundle["graph"].get("edges"), list
    ):
        raw_edges = compiled_bundle["graph"]["edges"]

    if not raw_edges:
        return [], False

    edges: list[dict[str, str]] = []
    for entry in raw_edges:
        if not isinstance(entry, dict):
            continue
        from_asset = _first_str(entry, "from_asset_id", "from_node", "from", "source")
        to_asset = _first_str(entry, "to_asset_id", "to_node", "to", "target")
        if from_asset is None or to_asset is None:
            continue
        edge_id = (
            _first_str(entry, "edge_id", "id")
            or f"EDGE_{from_asset}_TO_{to_asset}"
        )
        relation = _first_str(entry, "relation", "type", "edge_type") or "causes"
        edges.append(
            {
                "edge_id": edge_id,
                "from_asset_id": from_asset,
                "to_asset_id": to_asset,
                "relation": relation,
            }
        )

    return edges, bool(edges)


def _alarms_by_tag(active_alarms: list[Any]) -> dict[str, str]:
    severity_rank = {"warning": 1, "critical": 2}
    by_tag: dict[str, str] = {}
    for alarm in active_alarms:
        if not isinstance(alarm, dict):
            continue
        tag_id = alarm.get("tag_id")
        severity = str(alarm.get("severity", "")).lower()
        if not tag_id or severity not in severity_rank:
            continue
        current = by_tag.get(tag_id)
        if current is None or severity_rank[severity] > severity_rank.get(current, 0):
            by_tag[tag_id] = severity
    return by_tag


def _build_signal_states(
    tags: dict[str, Any],
    *,
    alarms_by_tag: dict[str, str],
    asset_metadata: list[dict[str, str]],
) -> list[SignalHMIState]:
    tag_names = _tag_display_names(asset_metadata)
    signal_states: list[SignalHMIState] = []

    for tag_key, tag in _iter_tags(tags):
        if not isinstance(tag, dict):
            continue
        signal_id = tag.get("tag_id") or tag_key
        asset_id = tag.get("asset_id") or "UNKNOWN_ASSET"
        quality = str(tag.get("quality", "GOOD")).upper()
        value = tag.get("value")
        alarm_severity = alarms_by_tag.get(signal_id)

        status, weight = _resolve_signal_status(quality=quality, value=value, alarm_severity=alarm_severity)

        signal_states.append(
            SignalHMIState(
                signal_id=signal_id,
                asset_id=asset_id,
                name=tag_names.get(signal_id, signal_id),
                value=value,
                unit=str(tag.get("unit") or ""),
                status=status,
                expected_range=None,
                evidence_weight=weight,
                timestamp=_parse_datetime(tag.get("timestamp")),
            )
        )

    return signal_states


def _iter_tags(tags: dict[str, Any]) -> list[tuple[str, Any]]:
    return list(tags.items())


def _resolve_signal_status(
    *,
    quality: str,
    value: Any,
    alarm_severity: str | None,
) -> tuple[HMISignalStatus, float]:
    if quality == "MISSING" or value is None:
        return HMISignalStatus.MISSING, _ZERO_WEIGHT
    if quality in {"STALE", "BAD"}:
        return HMISignalStatus.STALE, _ZERO_WEIGHT
    if alarm_severity == "critical":
        return HMISignalStatus.FAULT, _FAULT_WEIGHT
    if alarm_severity == "warning":
        return HMISignalStatus.WARNING, _WARNING_WEIGHT
    return HMISignalStatus.NORMAL, _NORMAL_WEIGHT


def _tag_display_names(asset_metadata: list[dict[str, str]]) -> dict[str, str]:
    return {}


def _build_runtime_data_quality(
    signals: list[SignalHMIState],
    bridge_notes: list[str],
    tags: dict[str, Any],
) -> DataQualityState:
    base = build_data_quality(signals)
    notes = _unique_notes(list(base.notes) + list(bridge_notes))
    if not tags:
        notes = _unique_notes(notes + [NOTE_NO_TAGS])
    return DataQualityState(
        missing_signals=base.missing_signals,
        stale_signals=base.stale_signals,
        confidence_penalty=base.confidence_penalty,
        notes=notes,
    )


def _unique_notes(notes: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for note in notes:
        if note not in seen:
            seen.add(note)
            ordered.append(note)
    return ordered


def _select_situation(active_situations: list[Any]) -> dict | None:
    valid = [situation for situation in active_situations if isinstance(situation, dict)]
    if not valid:
        return None

    def sort_key(situation: dict) -> tuple[str, str]:
        created_at = str(situation.get("created_at", ""))
        situation_id = str(situation.get("situation_id", ""))
        return (created_at, situation_id)

    return sorted(valid, key=sort_key)[0]


def _build_incident_from_situation(
    situation: dict,
    *,
    generated_at: datetime,
) -> IncidentHMIState:
    incident_id = situation.get("situation_id") or "INC_RUNTIME_ACTIVE"
    situation_type = situation.get("situation_type")
    root_asset_id = situation.get("root_asset_id")

    primary_alarms = _primary_alarms_from_situation(situation)
    grouped_alarm_ids = [
        alarm_id
        for alarm_id in (situation.get("grouped_alarm_ids") or [])
        if isinstance(alarm_id, str)
    ]
    secondary_symptoms = [
        alarm_id for alarm_id in grouped_alarm_ids if alarm_id not in primary_alarms
    ]

    affected_assets = _affected_assets_from_situation(situation)
    evidence = _map_situation_evidence(
        situation,
        incident_id=incident_id,
        primary_alarms=primary_alarms,
        root_asset_id=root_asset_id,
    )

    return IncidentHMIState(
        incident_id=incident_id,
        severity=_map_situation_severity(situation.get("severity")),
        title=situation.get("title")
        or (situation_type.replace("_", " ").title() if situation_type else "Active runtime situation"),
        summary=situation.get("confidence_reason")
        or "Runtime grouped active alarms into a deterministic situation.",
        suspected_root_cause=situation_type or root_asset_id or "UNKNOWN_RUNTIME_CAUSE",
        confidence=_situation_confidence(situation),
        started_at=_parse_datetime(situation.get("created_at")) or generated_at,
        affected_assets=affected_assets,
        primary_alarms=primary_alarms,
        secondary_symptoms=secondary_symptoms,
        evidence=evidence,
    )


def _primary_alarms_from_situation(situation: dict) -> list[str]:
    primary: list[str] = []
    for item in situation.get("evidence") or []:
        if not isinstance(item, dict):
            continue
        if item.get("role") == "first_signal":
            alarm_id = item.get("alarm_id")
            if isinstance(alarm_id, str) and alarm_id not in primary:
                primary.append(alarm_id)

    if primary:
        return primary

    grouped = situation.get("grouped_alarm_ids") or []
    if grouped and isinstance(grouped[0], str):
        return [grouped[0]]
    return []


def _affected_assets_from_situation(situation: dict) -> list[str]:
    root_asset_id = situation.get("root_asset_id")
    affected: list[str] = []
    if isinstance(root_asset_id, str):
        affected.append(root_asset_id)

    for asset_id in situation.get("affected_asset_ids") or []:
        if isinstance(asset_id, str) and asset_id not in affected:
            affected.append(asset_id)

    if affected:
        return affected

    if isinstance(root_asset_id, str):
        return [root_asset_id]
    return sorted(
        {
            asset_id
            for asset_id in (situation.get("affected_asset_ids") or [])
            if isinstance(asset_id, str)
        }
    )


def _map_situation_evidence(
    situation: dict,
    *,
    incident_id: str,
    primary_alarms: list[str],
    root_asset_id: str | None,
) -> list[EvidenceItem]:
    evidence_items: list[EvidenceItem] = []
    primary_set = set(primary_alarms)

    for index, item in enumerate(situation.get("evidence") or []):
        if not isinstance(item, dict):
            continue
        alarm_id = item.get("alarm_id")
        signal_id = (
            item.get("tag_id")
            or item.get("signal_id")
            or alarm_id
            or f"EVID_{incident_id}_{index}"
        )
        evidence_id = f"EVD_{incident_id}_{alarm_id or signal_id or index}"
        asset_id = item.get("asset_id") or root_asset_id or "UNKNOWN_ASSET"
        description = (
            item.get("reason")
            or item.get("message")
            or item.get("explanation")
            or str(signal_id)
        )
        item_severity = str(item.get("severity", situation.get("severity", ""))).lower()
        if item_severity == "critical":
            status = HMISignalStatus.FAULT
        elif item_severity == "warning":
            status = HMISignalStatus.WARNING
        else:
            status = HMISignalStatus.NORMAL

        is_primary = (
            item.get("role") == "first_signal"
            or (isinstance(alarm_id, str) and alarm_id in primary_set)
        )
        weight = 1.0 if is_primary else 0.5

        evidence_items.append(
            EvidenceItem(
                evidence_id=evidence_id,
                signal_id=str(signal_id),
                asset_id=str(asset_id),
                description=str(description),
                observed_value=item.get("value", item.get("observed_value")),
                unit=item.get("unit"),
                status=status,
                weight=weight,
                timestamp=_parse_datetime(
                    item.get("timestamp") or item.get("first_seen_ts") or situation.get("created_at")
                ),
            )
        )

    return evidence_items


def _map_situation_severity(severity: Any) -> HMISeverity:
    mapped = _SEVERITY_MAP.get(str(severity).lower())
    return mapped if mapped is not None else HMISeverity.WARNING


def _situation_confidence(situation: dict) -> float:
    score = situation.get("confidence_score")
    if isinstance(score, (int, float)):
        return round(clamp_confidence(float(score)), 4)

    confidence = situation.get("confidence")
    if isinstance(confidence, (int, float)):
        return round(clamp_confidence(float(confidence)), 4)

    if isinstance(confidence, str):
        mapped = _CONFIDENCE_STRING_MAP.get(confidence.lower())
        if mapped is not None:
            return round(mapped, 4)

    return 0.3


def _build_runtime_alarm_groups(incident: IncidentHMIState | None) -> list[AlarmGroup]:
    if incident is None:
        return []

    grouped_alarms = _unique_in_order(incident.primary_alarms + incident.secondary_symptoms)
    root_alarm = incident.primary_alarms[0] if incident.primary_alarms else None

    return [
        AlarmGroup(
            group_id=f"AG_{incident.incident_id}",
            title=f"{incident.title} alarm group",
            severity=incident.severity,
            root_alarm=root_alarm,
            grouped_alarms=grouped_alarms,
            suppressed_duplicates=list(incident.secondary_symptoms),
        )
    ]


def _build_causality_edges(
    edge_metadata: list[dict[str, str]],
    incident: IncidentHMIState | None,
) -> list[CausalityEdgeHMI]:
    affected_assets = set(incident.affected_assets) if incident is not None else set()
    edges: list[CausalityEdgeHMI] = []

    for edge in edge_metadata:
        active = (
            incident is not None
            and edge["from_asset_id"] in affected_assets
            and edge["to_asset_id"] in affected_assets
        )
        edges.append(
            CausalityEdgeHMI(
                edge_id=edge["edge_id"],
                from_asset_id=edge["from_asset_id"],
                to_asset_id=edge["to_asset_id"],
                relation=edge["relation"],
                active=active,
            )
        )

    return edges


def _build_asset_states(
    *,
    asset_metadata: list[dict[str, str]],
    signal_states: list[SignalHMIState],
    active_alarms: list[Any],
    asset_status_raw: dict[str, str],
    incident: IncidentHMIState | None,
    data_quality: DataQualityState,
) -> list[AssetHMIState]:
    signals_by_asset = _signals_by_asset(signal_states)
    alarms_by_asset = _alarms_by_asset(active_alarms)
    root_asset_id = _incident_root_asset(incident)
    degraded_signal_ids = set(data_quality.missing_signals) | set(data_quality.stale_signals)

    asset_states: list[AssetHMIState] = []
    for asset in asset_metadata:
        asset_id = asset["asset_id"]
        asset_signals = signals_by_asset.get(asset_id, [])
        status = _resolve_asset_status(
            asset_id=asset_id,
            asset_signals=asset_signals,
            asset_status_raw=asset_status_raw,
            incident=incident,
            root_asset_id=root_asset_id,
        )
        health_score = _asset_health_score(
            status=status,
            asset_signals=asset_signals,
            data_quality=data_quality,
            degraded_signal_ids=degraded_signal_ids,
        )
        active_faults = _active_faults_for_asset(
            asset_id=asset_id,
            asset_signals=asset_signals,
            alarms_by_asset=alarms_by_asset,
        )
        downstream_impacts = _downstream_impacts_for_asset(
            asset_id=asset_id,
            incident=incident,
            asset_signals=asset_signals,
        )

        asset_states.append(
            AssetHMIState(
                asset_id=asset_id,
                name=asset["name"],
                kind=asset["kind"],
                status=status,
                health_score=health_score,
                primary_signals=[signal.signal_id for signal in asset_signals],
                active_faults=active_faults,
                downstream_impacts=downstream_impacts,
            )
        )

    return asset_states


def _signals_by_asset(signals: list[SignalHMIState]) -> dict[str, list[SignalHMIState]]:
    by_asset: dict[str, list[SignalHMIState]] = {}
    for signal in signals:
        by_asset.setdefault(signal.asset_id, []).append(signal)
    return by_asset


def _alarms_by_asset(active_alarms: list[Any]) -> dict[str, list[str]]:
    by_asset: dict[str, list[str]] = {}
    for alarm in active_alarms:
        if not isinstance(alarm, dict):
            continue
        asset_id = alarm.get("asset_id")
        alarm_id = alarm.get("alarm_id")
        if isinstance(asset_id, str) and isinstance(alarm_id, str):
            by_asset.setdefault(asset_id, []).append(alarm_id)
    return by_asset


def _incident_root_asset(incident: IncidentHMIState | None) -> str | None:
    if incident is None:
        return None
    if incident.affected_assets:
        return incident.affected_assets[0]
    return None


def _resolve_asset_status(
    *,
    asset_id: str,
    asset_signals: list[SignalHMIState],
    asset_status_raw: dict[str, str],
    incident: IncidentHMIState | None,
    root_asset_id: str | None,
) -> HMIAssetStatus:
    raw_status = asset_status_raw.get(asset_id)
    if isinstance(raw_status, str):
        mapped = _RUNTIME_ASSET_STATUS_MAP.get(raw_status.lower())
        if mapped is not None:
            status = mapped
        else:
            status = _status_from_signals(asset_signals)
    else:
        status = _status_from_signals(asset_signals)

    if (
        incident is not None
        and root_asset_id == asset_id
        and status != HMIAssetStatus.OFFLINE
    ):
        return HMIAssetStatus.FAULT

    return status


def _status_from_signals(asset_signals: list[SignalHMIState]) -> HMIAssetStatus:
    if not asset_signals:
        return HMIAssetStatus.HEALTHY

    if any(signal.status == HMISignalStatus.FAULT for signal in asset_signals):
        return HMIAssetStatus.FAULT
    if any(
        signal.status in {HMISignalStatus.WARNING, HMISignalStatus.STALE, HMISignalStatus.MISSING}
        for signal in asset_signals
    ):
        return HMIAssetStatus.WARNING
    return HMIAssetStatus.HEALTHY


def _asset_health_score(
    *,
    status: HMIAssetStatus,
    asset_signals: list[SignalHMIState],
    data_quality: DataQualityState,
    degraded_signal_ids: set[str],
) -> float:
    score = HEALTH_SCORE_BY_STATUS[status]
    if any(signal.signal_id in degraded_signal_ids for signal in asset_signals):
        score -= data_quality.confidence_penalty * 100.0
    return round(clamp_confidence(score / 100.0) * 100.0, 2)


def _active_faults_for_asset(
    *,
    asset_id: str,
    asset_signals: list[SignalHMIState],
    alarms_by_asset: dict[str, list[str]],
) -> list[str]:
    alarm_ids = alarms_by_asset.get(asset_id, [])
    if alarm_ids:
        return _unique_in_order(alarm_ids)

    return [
        signal.signal_id
        for signal in asset_signals
        if signal.status == HMISignalStatus.FAULT
    ]


def _downstream_impacts_for_asset(
    *,
    asset_id: str,
    incident: IncidentHMIState | None,
    asset_signals: list[SignalHMIState],
) -> list[str]:
    if incident is None:
        return []

    root_asset_id = incident.affected_assets[0] if incident.affected_assets else None
    if asset_id == root_asset_id or asset_id not in incident.affected_assets:
        return []

    asset_signal_ids = {signal.signal_id for signal in asset_signals}
    return [
        symptom
        for symptom in incident.secondary_symptoms
        if symptom in asset_signal_ids
    ]


def _build_runtime_operator_actions(
    *,
    incident: IncidentHMIState | None,
    latest_calm_card: dict | None,
    data_quality: DataQualityState,
) -> list[OperatorAction]:
    if isinstance(latest_calm_card, dict):
        action = _operator_action_from_calm_card(latest_calm_card, incident=incident)
        if action is not None:
            return [action]

    if incident is not None:
        target_asset_id = incident.affected_assets[0] if incident.affected_assets else None
        return [
            OperatorAction(
                priority=1,
                title="Review runtime situation",
                instruction=(
                    "Review the grouped runtime evidence before taking operator action."
                ),
                safety_level=SafetyLevel.OBSERVE,
                target_asset_id=target_asset_id,
                rationale=(
                    "Runtime situation is active but no Calm Card action was available."
                ),
            )
        ]

    if _has_degraded_data_quality(data_quality):
        return [DATA_QUALITY_ACTION]

    return []


def _operator_action_from_calm_card(
    calm_card: dict,
    *,
    incident: IncidentHMIState | None,
) -> OperatorAction | None:
    recommended = calm_card.get("recommended_first_check")
    if not isinstance(recommended, dict):
        return None

    title = recommended.get("label") or "Perform recommended first check"
    instruction = (
        recommended.get("instruction")
        or recommended.get("label")
        or "Review the runtime Calm Card recommended first check."
    )

    requires_isolation = bool(recommended.get("requires_isolation"))
    risk_level = str(recommended.get("risk_level", "")).lower()
    if requires_isolation:
        safety_level = SafetyLevel.ISOLATE_BEFORE_TOUCH
    elif risk_level in {"high", "critical"}:
        safety_level = SafetyLevel.CAUTION
    else:
        safety_level = SafetyLevel.OBSERVE

    target_asset_id = calm_card.get("root_asset_id")
    if target_asset_id is None and incident is not None and incident.affected_assets:
        target_asset_id = incident.affected_assets[0]

    rationale = (
        calm_card.get("why_it_matters")
        or calm_card.get("confidence_reason")
        or "Runtime Calm Card selected this as the recommended first check."
    )

    return OperatorAction(
        priority=1,
        title=str(title),
        instruction=str(instruction),
        safety_level=safety_level,
        target_asset_id=target_asset_id,
        rationale=str(rationale),
    )


def _has_degraded_data_quality(data_quality: DataQualityState) -> bool:
    return bool(data_quality.missing_signals or data_quality.stale_signals)


def _derive_runtime_overall_status(
    *,
    incident: IncidentHMIState | None,
    assets: list[AssetHMIState],
    data_quality: DataQualityState,
    has_tags: bool,
) -> HMIOverallStatus:
    if any(asset.status == HMIAssetStatus.OFFLINE for asset in assets):
        return HMIOverallStatus.OFFLINE

    if incident is not None and incident.severity == HMISeverity.CRITICAL:
        return HMIOverallStatus.FAULT

    if any(asset.status == HMIAssetStatus.FAULT for asset in assets):
        return HMIOverallStatus.FAULT

    if incident is not None:
        return HMIOverallStatus.WARNING

    if data_quality.confidence_penalty > 0:
        return HMIOverallStatus.WARNING

    if any(asset.status == HMIAssetStatus.WARNING for asset in assets):
        return HMIOverallStatus.WARNING

    if not has_tags and incident is None:
        return HMIOverallStatus.WARNING

    return HMIOverallStatus.HEALTHY


def _parse_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value
    if isinstance(value, str):
        normalized = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=UTC)
        return parsed
    return None


def _first_str(mapping: dict, *keys: str) -> str | None:
    for key in keys:
        value = mapping.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def _unique_in_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            ordered.append(item)
    return ordered