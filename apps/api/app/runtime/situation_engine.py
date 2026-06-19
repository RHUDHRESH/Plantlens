"""Collapse alarm floods into coherent Situation records."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.runtime.dag_runtime import Candidate, diagnose, evaluate_conditions
from app.runtime.runtime_state import RuntimeState


def _has_non_good_evidence(state: RuntimeState) -> bool:
    for frame in state.tags.values():
        if frame.quality in {"STALE", "MISSING", "BAD"}:
            return True
    return False


def _match_situation_type(
    root: Candidate,
    alarm_ids: set[str],
    graph_index: dict[str, Any],
    state: RuntimeState,
) -> dict[str, Any] | None:
    """Infer situation_type from authored causal_graph.situation_types — fail closed."""
    for spec in graph_index.get("situation_types", []):
        if spec.get("root_asset_id") != root.node_id:
            continue
        if root.score < float(spec.get("min_root_score", MIN_ROOT_SCORE)):
            continue
        required = set(spec.get("required_alarms", []))
        if spec.get("require_all_alarms", True):
            if not required.issubset(alarm_ids):
                continue
        elif not required.intersection(alarm_ids):
            continue
        extra = spec.get("extra_conditions", [])
        if extra and not evaluate_conditions(extra, state.active_alarms, state.tags):
            continue
        return spec
    return None


MIN_ROOT_SCORE = 0.1


def _confidence_bucket(score: float) -> str:
    if score >= 0.75:
        return "high"
    if score >= 0.45:
        return "medium"
    return "low"


def evaluate_situations(
    state: RuntimeState,
    active_alarms: list[dict[str, Any]],
    graph_index: dict[str, Any],
    *,
    now: datetime | None = None,
    asset_index: dict[str, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    if not active_alarms:
        return []

    alarm_map = {alarm["alarm_id"]: alarm for alarm in active_alarms}
    state.active_alarms = alarm_map

    if _has_non_good_evidence(state):
        good_alarm_tags = [
            alarm
            for alarm in active_alarms
            if (tag := state.get_tag(alarm.get("tag_id", ""))) is not None and tag.quality == "GOOD"
        ]
        if not good_alarm_tags:
            return []

    symptom = sorted(
        active_alarms,
        key=lambda alarm: (_parse_ts(alarm["raised_at"]), alarm["alarm_id"]),
    )[0]
    candidates: list[Candidate] = diagnose(
        symptom["alarm_id"],
        graph_index,
        state,
        now=now,
    )
    if not candidates:
        return []

    root = candidates[0]
    alarm_ids = {alarm["alarm_id"] for alarm in active_alarms}
    situation_spec = _match_situation_type(root, alarm_ids, graph_index, state)
    if situation_spec is None:
        return []

    situation_type = situation_spec["id"]
    evidence = _build_evidence(active_alarms, situation_spec.get("evidence_order"))
    affected_assets = sorted(
        {alarm["asset_id"] for alarm in active_alarms if alarm.get("asset_id")}
    )
    causal_path = _build_causal_path(root, graph_index, active_alarms, situation_spec)

    created_at = now or datetime.now(timezone.utc)
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    root_name = None
    if asset_index and root.node_id in asset_index:
        root_name = asset_index[root.node_id].get("display_name")

    situation = {
        "situation_id": f"SIT_{situation_type}",
        "situation_type": situation_type,
        "title": situation_spec.get("title", situation_type.replace("_", " ").title()),
        "severity": _worst_severity(active_alarms),
        "root_asset_id": root.node_id,
        "root_asset_name": root_name,
        "confidence": _confidence_bucket(root.score),
        "created_at": created_at.isoformat().replace("+00:00", "Z"),
        "grouped_alarm_ids": sorted(alarm_ids),
        "affected_asset_ids": affected_assets,
        "causal_path": causal_path,
        "traversed_edges": list(root.traversed_edges),
        "evidence": evidence,
    }
    return [situation]


def _parse_ts(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        ts = value
    else:
        ts = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts


def _worst_severity(alarms: list[dict[str, Any]]) -> str:
    order = {"info": 0, "warning": 1, "critical": 2}
    return max((alarm.get("severity", "info") for alarm in alarms), key=lambda s: order.get(s, 0))


def _build_evidence(
    active_alarms: list[dict[str, Any]],
    evidence_order: list[str] | None,
) -> list[dict[str, Any]]:
    alarm_by_id = {alarm["alarm_id"]: alarm for alarm in active_alarms}
    if evidence_order:
        ordered_alarms = [alarm_by_id[aid] for aid in evidence_order if aid in alarm_by_id]
        remaining = [a for a in active_alarms if a["alarm_id"] not in evidence_order]
        ordered_alarms.extend(
            sorted(remaining, key=lambda alarm: (_parse_ts(alarm["raised_at"]), alarm["alarm_id"]))
        )
    else:
        ordered_alarms = sorted(
            active_alarms, key=lambda alarm: (_parse_ts(alarm["raised_at"]), alarm["alarm_id"])
        )
    evidence: list[dict[str, Any]] = []
    for index, alarm in enumerate(ordered_alarms):
        evidence.append(
            {
                "alarm_id": alarm["alarm_id"],
                "asset_id": alarm["asset_id"],
                "timestamp": alarm["raised_at"],
                "reason": alarm.get("message", alarm["alarm_id"]),
                "role": "first_signal" if index == 0 else "evidence",
            }
        )
    return evidence


def _build_causal_path(
    root: Candidate,
    graph_index: dict[str, Any],
    active_alarms: list[dict[str, Any]],
    situation_spec: dict[str, Any],
) -> list[str]:
    evidence_order = situation_spec.get("evidence_order") or []
    path_assets: list[str] = []
    alarm_by_id = {alarm["alarm_id"]: alarm for alarm in active_alarms}
    for alarm_id in evidence_order:
        alarm = alarm_by_id.get(alarm_id)
        if alarm and alarm.get("asset_id") and alarm["asset_id"] not in path_assets:
            path_assets.append(alarm["asset_id"])
    if root.node_id not in path_assets:
        path_assets.insert(0, root.node_id)
    elif path_assets[0] != root.node_id:
        path_assets = [root.node_id] + [a for a in path_assets if a != root.node_id]
    return path_assets