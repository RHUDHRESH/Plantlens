"""Deterministic DAG root-cause traversal over approved edges only."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from app.runtime.config_loader import GraphEdge
from app.runtime.runtime_state import RuntimeState

# Named defaults — visible in config via min_root_score on situation_types
DEFAULT_MIN_ROOT_SCORE = 0.1
HIGH_CONFIDENCE_THRESHOLD = 0.75
MEDIUM_CONFIDENCE_THRESHOLD = 0.45


@dataclass(frozen=True, slots=True)
class Candidate:
    node_id: str
    score: float
    reasons: tuple[str, ...]
    traversed_edges: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class RejectedCandidateRecord:
    asset_id: str
    reason: str
    score: float
    missing_evidence: tuple[str, ...] = ()
    contradicted_by: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class RootCauseTrace:
    trace_id: str
    selected_root: str | None
    confidence: float
    confidence_bucket: str
    confidence_reason: str
    candidates: tuple[Candidate, ...]
    rejected_candidates: tuple[RejectedCandidateRecord, ...]
    data_quality_notes: tuple[str, ...]


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


def evaluate_condition(
    condition: dict[str, Any],
    active_alarms: dict[str, dict[str, Any]],
    latest_tags: dict[str, Any],
) -> bool:
    """Evaluate one whitelisted config condition — no eval()."""
    ctype = condition.get("type")
    if ctype == "alarms_all":
        required = set(condition.get("alarm_ids", []))
        return required.issubset(active_alarms.keys())
    if ctype == "alarms_any":
        return bool(set(condition.get("alarm_ids", [])) & set(active_alarms.keys()))
    if ctype == "alarms_absent":
        return not any(aid in active_alarms for aid in condition.get("alarm_ids", []))
    if ctype == "alarm_before":
        first = active_alarms.get(condition.get("first", ""))
        second = active_alarms.get(condition.get("second", ""))
        if not first or not second:
            return False
        return _parse_ts(first["raised_at"]) <= _parse_ts(second["raised_at"])
    if ctype == "tag_threshold":
        frame = latest_tags.get(condition.get("tag_id", ""))
        if frame is None or getattr(frame, "quality", "GOOD") != "GOOD":
            return False
        value = frame.value
        if not isinstance(value, (int, float)):
            return False
        threshold = float(condition.get("value", 0))
        op = condition.get("op", "lt")
        if op == "lt":
            return float(value) < threshold
        if op == "lte":
            return float(value) <= threshold
        if op == "gt":
            return float(value) > threshold
        if op == "gte":
            return float(value) >= threshold
        if op == "eq":
            return float(value) == threshold
        return False
    if ctype == "tag_quality_good":
        frame = latest_tags.get(condition.get("tag_id", ""))
        return frame is not None and getattr(frame, "quality", "GOOD") == "GOOD"
    return False


def evaluate_conditions(
    conditions: list[dict[str, Any]],
    active_alarms: dict[str, dict[str, Any]],
    latest_tags: dict[str, Any],
) -> bool:
    if not conditions:
        return False
    return all(evaluate_condition(cond, active_alarms, latest_tags) for cond in conditions)


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
        if evaluate_conditions(rule.get("conditions", []), active_alarms, latest_tags):
            score += float(rule.get("score_bonus", 0.5))
            reasons.append(f"root_cause_rule matched: {rule.get('logic', rule.get('target_node'))}")

    for fp_rule in node.get("fingerprint_rules", []):
        if evaluate_conditions(fp_rule.get("conditions", []), active_alarms, latest_tags):
            score += float(fp_rule.get("score_bonus", 0.0))
            if fp_rule.get("reason"):
                reasons.append(str(fp_rule["reason"]))

    for adjustment in node.get("score_adjustments", []):
        if evaluate_conditions(adjustment.get("when", []), active_alarms, latest_tags):
            score *= float(adjustment.get("multiply", 1.0))
            if adjustment.get("reason"):
                reasons.append(str(adjustment["reason"]))

    return max(0.0, min(1.0, score)), tuple(reasons)


def _confidence_bucket(score: float) -> str:
    if score >= HIGH_CONFIDENCE_THRESHOLD:
        return "high"
    if score >= MEDIUM_CONFIDENCE_THRESHOLD:
        return "medium"
    return "low"


def _collect_data_quality_notes(state: RuntimeState) -> tuple[str, ...]:
    notes: list[str] = []
    for tag_id, frame in state.tags.items():
        if frame.quality in {"STALE", "MISSING", "BAD"}:
            notes.append(f"{tag_id}: {frame.quality}")
    return tuple(notes)


def diagnose(
    symptom_alarm_id: str,
    graph_index: dict[str, Any],
    state: RuntimeState,
    *,
    now: datetime | None = None,
    min_root_score: float = DEFAULT_MIN_ROOT_SCORE,
) -> list[Candidate]:
    trace = diagnose_trace(
        symptom_alarm_id,
        graph_index,
        state,
        now=now,
        min_root_score=min_root_score,
    )
    return list(trace.candidates)


def diagnose_trace(
    symptom_alarm_id: str,
    graph_index: dict[str, Any],
    state: RuntimeState,
    *,
    now: datetime | None = None,
    min_root_score: float = DEFAULT_MIN_ROOT_SCORE,
) -> RootCauseTrace:
    """Reverse-walk approved edges; return full trace with rejected candidates."""
    _ = now
    trace_id = f"TRACE_{uuid.uuid4().hex[:12].upper()}"
    data_notes = _collect_data_quality_notes(state)
    rejected: list[RejectedCandidateRecord] = []

    active_alarms = state.active_alarms
    if not active_alarms:
        return RootCauseTrace(
            trace_id=trace_id,
            selected_root=None,
            confidence=0.0,
            confidence_bucket="low",
            confidence_reason="No active alarms",
            candidates=(),
            rejected_candidates=(),
            data_quality_notes=data_notes,
        )

    if data_notes and not any(
        (tag := state.get_tag(a.get("tag_id", ""))) is not None and tag.quality == "GOOD"
        for a in active_alarms.values()
    ):
        return RootCauseTrace(
            trace_id=trace_id,
            selected_root=None,
            confidence=0.0,
            confidence_bucket="low",
            confidence_reason="Only stale/BAD/MISSING evidence — no confident root cause",
            candidates=(),
            rejected_candidates=(),
            data_quality_notes=data_notes,
        )

    symptom = active_alarms.get(symptom_alarm_id) or next(iter(active_alarms.values()))
    symptom_asset = symptom.get("asset_id")
    if not symptom_asset:
        return RootCauseTrace(
            trace_id=trace_id,
            selected_root=None,
            confidence=0.0,
            confidence_bucket="low",
            confidence_reason="Symptom alarm has no asset_id",
            candidates=(),
            rejected_candidates=(),
            data_quality_notes=data_notes,
        )

    seed_nodes = [symptom_asset]
    visited: set[str] = set()
    frontier: list[tuple[str, float, tuple[str, ...]]] = [(node, 0.0, ()) for node in seed_nodes]
    candidates: list[Candidate] = []
    effect_ts = _parse_ts(symptom["raised_at"])

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
        adjusted = score - priority * 0.01

        if adjusted >= min_root_score:
            candidates.append(
                Candidate(
                    node_id=current,
                    score=adjusted,
                    reasons=reasons,
                    traversed_edges=path_edges,
                )
            )
        elif score > 0:
            rejected.append(
                RejectedCandidateRecord(
                    asset_id=current,
                    reason=f"Score {adjusted:.2f} below threshold {min_root_score}",
                    score=adjusted,
                    missing_evidence=(),
                )
            )

        for edge in graph_index["reverse_adjacency"].get(current, []):
            if not edge.approved:
                rejected.append(
                    RejectedCandidateRecord(
                        asset_id=edge.from_node,
                        reason=f"Edge {edge.id} not approved for runtime",
                        score=0.0,
                    )
                )
                continue
            cause_alarm = _find_alarm_for_asset(active_alarms, edge.from_node)
            cause_ts = _parse_ts(cause_alarm["raised_at"]) if cause_alarm else None
            if violates_temporal_window(edge, cause_ts, effect_ts):
                rejected.append(
                    RejectedCandidateRecord(
                        asset_id=edge.from_node,
                        reason=f"Temporal window violated on edge {edge.id}",
                        score=0.0,
                        contradicted_by=(edge.id,),
                    )
                )
                continue
            new_priority = priority + edge_penalty(edge)
            new_path = path_edges + (edge.id,)
            frontier.append((edge.from_node, new_priority, new_path))

    candidates.sort(key=lambda item: (-item.score, item.node_id))
    deduped: dict[str, Candidate] = {}
    for candidate in candidates:
        deduped.setdefault(candidate.node_id, candidate)
    ranked = sorted(deduped.values(), key=lambda item: (-item.score, item.node_id))[:5]

    selected: str | None = None
    confidence = 0.0
    confidence_reason = "No candidate met minimum score threshold"

    if ranked:
        top = ranked[0]
        if top.score >= min_root_score:
            selected = top.node_id
            confidence = top.score
            confidence_reason = "; ".join(top.reasons) if top.reasons else "Fingerprint match on approved graph"
        else:
            rejected.append(
                RejectedCandidateRecord(
                    asset_id=top.node_id,
                    reason=f"Top candidate score {top.score:.2f} below threshold",
                    score=top.score,
                )
            )

    for cand in ranked[1:]:
        rejected.append(
            RejectedCandidateRecord(
                asset_id=cand.node_id,
                reason=f"Lower rank than {selected or 'none'} (score {cand.score:.2f})",
                score=cand.score,
            )
        )

    return RootCauseTrace(
        trace_id=trace_id,
        selected_root=selected,
        confidence=confidence,
        confidence_bucket=_confidence_bucket(confidence),
        confidence_reason=confidence_reason,
        candidates=tuple(ranked),
        rejected_candidates=tuple(rejected),
        data_quality_notes=data_notes,
    )


def _find_alarm_for_asset(active_alarms: dict[str, dict[str, Any]], asset_id: str):
    for alarm in active_alarms.values():
        if alarm.get("asset_id") == asset_id:
            return alarm
    return None