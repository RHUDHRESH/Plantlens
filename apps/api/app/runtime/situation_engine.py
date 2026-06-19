"""Collapse alarm floods into coherent Situation records."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.runtime.dag_runtime import Candidate, diagnose
from app.runtime.runtime_state import RuntimeState


SITUATION_PATTERNS: dict[str, frozenset[str]] = {
    "MOTOR_MECHANICAL_OVERLOAD": frozenset(
        {
            "MOTOR_CURRENT_HIGH",
            "MOTOR_SPEED_LOW",
            "DC_BUS_LOW",
            "INV_UNDERVOLTAGE",
        }
    ),
    "PV_GENERATION_LOSS": frozenset({"DC_BUS_LOW"}),
}


def _has_non_good_evidence(state: RuntimeState) -> bool:
    for frame in state.tags.values():
        if frame.quality in {"STALE", "MISSING", "BAD"}:
            return True
    return False


def _infer_situation_type(root_asset_id: str, alarm_ids: set[str]) -> str | None:
    for situation_type, required in SITUATION_PATTERNS.items():
        if situation_type == "MOTOR_MECHANICAL_OVERLOAD" and root_asset_id == "MTR-301":
            if required.issubset(alarm_ids):
                return situation_type
        if situation_type == "PV_GENERATION_LOSS" and root_asset_id == "PV-101":
            if required.intersection(alarm_ids):
                return situation_type
    return None


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

    # No confident situation from stale-only data.
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
    situation_type = _infer_situation_type(root.node_id, alarm_ids)
    if situation_type is None:
        return []

    evidence = _build_evidence(active_alarms)
    affected_assets = sorted(
        {alarm["asset_id"] for alarm in active_alarms if alarm.get("asset_id")}
    )
    causal_path = _build_causal_path(root, graph_index, active_alarms)

    created_at = now or datetime.now(timezone.utc)
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    root_name = None
    if asset_index and root.node_id in asset_index:
        root_name = asset_index[root.node_id].get("display_name")

    situation = {
        "situation_id": f"SIT_{situation_type}",
        "situation_type": situation_type,
        "title": situation_type.replace("_", " ").title(),
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


def _build_evidence(active_alarms: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ordered = sorted(active_alarms, key=lambda alarm: (_parse_ts(alarm["raised_at"]), alarm["alarm_id"]))
    evidence: list[dict[str, Any]] = []
    for index, alarm in enumerate(ordered):
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
) -> list[str]:
    assets = sorted({alarm["asset_id"] for alarm in active_alarms if alarm.get("asset_id")})
    if root.node_id in assets:
        ordered = [root.node_id] + [asset for asset in assets if asset != root.node_id]
        return ordered
    return [root.node_id, *assets]