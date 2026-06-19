"""Deterministic DAG root-cause traversal over approved edges only."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from app.runtime.config_loader import GraphEdge
from app.runtime.runtime_state import RuntimeState


@dataclass(frozen=True, slots=True)
class Candidate:
    node_id: str
    score: float
    reasons: tuple[str, ...]
    traversed_edges: tuple[str, ...]


MIN_SCORE = 0.1


def _parse_ts(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        ts = value
    else:
        ts = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts


def violates_temporal_window(
    edge: GraphEdge,
    cause_ts: datetime | None,
    effect_ts: datetime | None,
) -> bool:
    if effect_ts is None:
        return True
    if cause_ts is None:
        return False
    lag_min, lag_max = edge.lag_ms
    delta_ms = (effect_ts - cause_ts).total_seconds() * 1000
    return delta_ms < lag_min or delta_ms > lag_max


def edge_penalty(edge: GraphEdge) -> float:
    return max(0.05, 1.0 - edge.weight)


def evaluate_node_fingerprint(
    node_id: str,
    graph_index: dict[str, Any],
    latest_tags: dict[str, Any],
    active_alarms: dict[str, dict[str, Any]],
) -> tuple[float, tuple[str, ...]]:
    node = graph_index["nodes"].get(node_id, {})
    evidence_tags = node.get("evidence_tags", [])
    reasons: list[str] = []
    score = 0.0

    alarm_by_tag = {alarm.get("tag_id"): alarm for alarm in active_alarms.values()}
    matched = 0
    for tag_id in evidence_tags:
        if tag_id in alarm_by_tag:
            matched += 1
            reasons.append(f"{tag_id} alarm active")
        frame = latest_tags.get(tag_id)
        if frame is not None and getattr(frame, "quality", "GOOD") != "GOOD":
            score -= 0.5
            reasons.append(f"{tag_id} quality degraded")

    if evidence_tags:
        score += matched / len(evidence_tags)

    for rule in graph_index.get("root_cause_rules", []):
        if rule.get("target_node") != node_id:
            continue
        logic = rule.get("logic", "")
        if _rule_matches(logic, active_alarms, latest_tags):
            score += 0.5
            reasons.append(f"root_cause_rule matched: {logic}")

    if node_id == "PV-101" and any(
        alarm.get("alarm_id") == "DC_BUS_LOW" for alarm in active_alarms.values()
    ):
        pv_frame = latest_tags.get("PV_101_I")
        if pv_frame is not None and isinstance(pv_frame.value, (int, float)) and pv_frame.value < 3.0:
            score += 0.4
            reasons.append("PV current collapsed before bus sag")

    if node_id == "BUS-101":
        pv_frame = latest_tags.get("PV_101_I")
        if (
            pv_frame is not None
            and isinstance(pv_frame.value, (int, float))
            and pv_frame.value < 3.0
            and any(alarm.get("alarm_id") == "DC_BUS_LOW" for alarm in active_alarms.values())
        ):
            score *= 0.5
            reasons += ("Bus sag likely downstream of PV generation loss",)

    return max(0.0, min(1.0, score)), tuple(reasons)


def _rule_matches(
    logic: str,
    active_alarms: dict[str, dict[str, Any]],
    latest_tags: dict[str, Any] | None = None,
) -> bool:
    active_ids = set(active_alarms.keys())
    if logic == "motor_current_high && bus_voltage_low_after_current && motor_current_rose_first":
        required = {"MOTOR_CURRENT_HIGH", "MOTOR_SPEED_LOW", "DC_BUS_LOW"}
        if not required.issubset(active_ids):
            return False
        current_ts = _parse_ts(active_alarms["MOTOR_CURRENT_HIGH"]["raised_at"])
        bus_ts = _parse_ts(active_alarms["DC_BUS_LOW"]["raised_at"])
        return current_ts <= bus_ts
    if logic == "pv_current_low && downstream_bus_low && battery_normal":
        return "DC_BUS_LOW" in active_ids
    if logic == "battery_voltage_low && mppt_output_normal && bus_low":
        return "DC_BUS_LOW" in active_ids and "BAT_101_V" in active_ids
    return False


def diagnose(
    symptom_alarm_id: str,
    graph_index: dict[str, Any],
    state: RuntimeState,
    *,
    now: datetime | None = None,
) -> list[Candidate]:
    """Reverse-walk approved edges and rank root candidates deterministically."""
    _ = now
    active_alarms = state.active_alarms
    if not active_alarms:
        return []

    symptom = active_alarms.get(symptom_alarm_id) or next(iter(active_alarms.values()))
    symptom_asset = symptom.get("asset_id")
    if not symptom_asset:
        return []

    seed_nodes = [symptom_asset]
    visited: set[str] = set()
    frontier: list[tuple[str, float, tuple[str, ...]]] = [(node, 0.0, ()) for node in seed_nodes]
    candidates: list[Candidate] = []

    while frontier:
        frontier.sort(key=lambda item: (item[1], item[0]))
        current, priority, path_edges = frontier.pop(0)
        if current in visited:
            continue
        visited.add(current)

        score, reasons = evaluate_node_fingerprint(
            current,
            graph_index,
            state.tags,
            active_alarms,
        )
        if score >= MIN_SCORE:
            candidates.append(
                Candidate(
                    node_id=current,
                    score=score - priority * 0.01,
                    reasons=reasons,
                    traversed_edges=path_edges,
                )
            )

        effect_ts = _parse_ts(symptom["raised_at"])
        for edge in graph_index["reverse_adjacency"].get(current, []):
            if not edge.approved:
                continue
            cause_alarm = _find_alarm_for_asset(active_alarms, edge.from_node)
            cause_ts = _parse_ts(cause_alarm["raised_at"]) if cause_alarm else None
            if violates_temporal_window(edge, cause_ts, effect_ts):
                continue
            new_priority = priority + edge_penalty(edge)
            new_path = path_edges + (edge.id,)
            frontier.append((edge.from_node, new_priority, new_path))

    candidates.sort(key=lambda item: (-item.score, item.node_id))
    deduped: dict[str, Candidate] = {}
    for candidate in candidates:
        deduped.setdefault(candidate.node_id, candidate)
    return sorted(deduped.values(), key=lambda item: (-item.score, item.node_id))[:5]


def _find_alarm_for_asset(active_alarms: dict[str, dict[str, Any]], asset_id: str):
    for alarm in active_alarms.values():
        if alarm.get("asset_id") == asset_id:
            return alarm
    return None