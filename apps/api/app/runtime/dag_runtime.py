"""Deterministic root-cause diagnosis over approved edges only (R2).

Public API kept stable for callers; scoring lives in ``app.runtime.causal`` (see
docs/ALGORITHMS.md §3). No ML, no LLM, no graph mutation, deterministic ids.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from app.runtime.causal.confidence import (
    HIGH_CONFIDENCE_THRESHOLD,  # noqa: F401 — re-exported for callers
    MEDIUM_CONFIDENCE_THRESHOLD,  # noqa: F401
    confidence_bucket,
)
from app.runtime.causal.engine import (
    RootHypothesis,
    RootScore,
    deterministic_trace_id,
    select_roots,
)
from app.runtime.causal.structure import structure_for
from app.runtime.config_loader import GraphEdge
from app.runtime.runtime_state import RuntimeState

# Named defaults — visible in config via min_root_score on situation_types
DEFAULT_MIN_ROOT_SCORE = 0.1


@dataclass(frozen=True, slots=True)
class Candidate:
    node_id: str
    score: float
    reasons: tuple[str, ...]
    traversed_edges: tuple[str, ...]
    explained_alarms: tuple[str, ...] = ()
    unexplained_alarms: tuple[str, ...] = ()
    contradicting_alarms: tuple[str, ...] = ()


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
    roots: tuple[RootHypothesis, ...] = ()
    scores: tuple[RootScore, ...] = ()


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
    return confidence_bucket(score)


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


def _empty_trace(trace_id: str, reason: str, notes: tuple[str, ...]) -> RootCauseTrace:
    return RootCauseTrace(
        trace_id=trace_id,
        selected_root=None,
        confidence=0.0,
        confidence_bucket="low",
        confidence_reason=reason,
        candidates=(),
        rejected_candidates=(),
        data_quality_notes=notes,
    )


def _guard(state: RuntimeState, graph_index: dict[str, Any]) -> tuple[str, tuple[str, ...], str | None]:
    """Shared fail-closed checks; returns (trace_id, notes, refusal_reason_or_None)."""
    active_alarms = state.active_alarms
    trace_id = deterministic_trace_id(graph_index, active_alarms)
    notes = _collect_data_quality_notes(state)
    if not active_alarms:
        return trace_id, notes, "No active alarms"
    if notes and not any(
        (tag := state.get_tag(a.get("tag_id", ""))) is not None and tag.quality == "GOOD"
        for a in active_alarms.values()
    ):
        return trace_id, notes, "Only stale/BAD/MISSING evidence — no confident root cause"
    return trace_id, notes, None


def _unapproved_rejections(graph_index: dict[str, Any], nodes: set[str]) -> list[RejectedCandidateRecord]:
    out: list[RejectedCandidateRecord] = []
    for node in sorted(nodes):
        for edge in graph_index.get("reverse_adjacency", {}).get(node, []):
            if not edge.approved:
                out.append(
                    RejectedCandidateRecord(
                        asset_id=edge.from_node,
                        reason=f"Edge {edge.id} not approved for runtime",
                        score=0.0,
                    )
                )
    return out


def _build_trace(
    *,
    trace_id: str,
    notes: tuple[str, ...],
    graph_index: dict[str, Any],
    hypotheses: list[RootHypothesis],
    ranked: list[RootScore],
    min_root_score: float,
    considered: set[str],
    alarms: dict[str, dict[str, Any]],
) -> RootCauseTrace:
    candidates = tuple(
        Candidate(
            node_id=r.node_id,
            score=r.score,
            reasons=r.reasons,
            traversed_edges=r.path_edges,
            explained_alarms=r.explained,
            unexplained_alarms=r.unexplained,
            contradicting_alarms=r.contradicting,
        )
        for r in ranked
        if r.score >= min_root_score
    )[:5]
    selected = hypotheses[0] if hypotheses else None
    alarmed_tags = {a.get("tag_id") for a in alarms.values()}
    rejected: list[RejectedCandidateRecord] = []
    for r in ranked:
        if selected is not None and r.node_id == selected.node_id:
            continue
        if r.score <= 0 and not r.contradicting:
            continue
        if r.score < min_root_score:
            reason = f"Score {r.score:.2f} below threshold {min_root_score}"
        elif any(h.node_id == r.node_id for h in hypotheses):
            reason = f"Independent root (explains {', '.join(r.explained)})"
        else:
            reason = (
                f"Lower rank than {selected.node_id if selected else 'none'} "
                f"(score {r.score:.2f}; T={r.timing:.2f} C={r.coverage:.2f} F={r.fingerprint:.2f})"
            )
        evidence_tags = graph_index.get("nodes", {}).get(r.node_id, {}).get("evidence_tags", [])
        rejected.append(
            RejectedCandidateRecord(
                asset_id=r.node_id,
                reason=reason,
                score=r.score,
                missing_evidence=tuple(t for t in evidence_tags if t not in alarmed_tags)
                if r.score < min_root_score
                else (),
                contradicted_by=r.contradicting,
            )
        )
    rejected.extend(_unapproved_rejections(graph_index, considered))

    if selected is None:
        top = ranked[0] if ranked else None
        reason = (
            f"Top candidate {top.node_id} score {top.score:.2f} below threshold"
            if top
            else "No candidate met minimum score threshold"
        )
        return RootCauseTrace(
            trace_id=trace_id,
            selected_root=None,
            confidence=0.0,
            confidence_bucket="low",
            confidence_reason=reason,
            candidates=candidates,
            rejected_candidates=tuple(rejected),
            data_quality_notes=notes,
            roots=(),
            scores=tuple(ranked),
        )

    top_score = next(r for r in ranked if r.node_id == selected.node_id)
    reason_parts = list(top_score.reasons) or ["Fingerprint match on approved graph"]
    if selected.competitor:
        reason_parts.append(f"margin {selected.margin:.2f} over {selected.competitor}")
    return RootCauseTrace(
        trace_id=trace_id,
        selected_root=selected.node_id,
        confidence=selected.confidence,
        confidence_bucket=selected.bucket,
        confidence_reason="; ".join(reason_parts),
        candidates=candidates,
        rejected_candidates=tuple(rejected),
        data_quality_notes=notes,
        roots=tuple(hypotheses),
        scores=tuple(ranked),
    )


def diagnose_trace(
    symptom_alarm_id: str,
    graph_index: dict[str, Any],
    state: RuntimeState,
    *,
    now: datetime | None = None,
    min_root_score: float = DEFAULT_MIN_ROOT_SCORE,
) -> RootCauseTrace:
    """Explain one symptom: candidates are its node and approved ancestors only."""
    trace_id, notes, refusal = _guard(state, graph_index)
    if refusal:
        return _empty_trace(trace_id, refusal, notes)

    active_alarms = state.active_alarms
    symptom = active_alarms.get(symptom_alarm_id) or next(iter(active_alarms.values()))
    symptom_asset = symptom.get("asset_id")
    if not symptom_asset:
        return _empty_trace(trace_id, "Symptom alarm has no asset_id", notes)

    allowed = {symptom_asset} | set(structure_for(graph_index).ancestors_of(symptom_asset))
    hypotheses, ranked = select_roots(
        graph_index,
        active_alarms,
        state.tags,
        min_root_score=min_root_score,
        fingerprint_fn=evaluate_node_fingerprint,
        now=now,
        restrict_to=allowed,
    )
    return _build_trace(
        trace_id=trace_id,
        notes=notes,
        graph_index=graph_index,
        hypotheses=hypotheses[:1],
        ranked=ranked,
        min_root_score=min_root_score,
        considered=allowed,
        alarms=active_alarms,
    )


def diagnose_flood(
    graph_index: dict[str, Any],
    state: RuntimeState,
    *,
    now: datetime | None = None,
    min_root_score: float = DEFAULT_MIN_ROOT_SCORE,
) -> RootCauseTrace:
    """Explain the whole alarm flood: smallest set of roots that accounts for it."""
    trace_id, notes, refusal = _guard(state, graph_index)
    if refusal:
        return _empty_trace(trace_id, refusal, notes)
    hypotheses, ranked = select_roots(
        graph_index,
        state.active_alarms,
        state.tags,
        min_root_score=min_root_score,
        fingerprint_fn=evaluate_node_fingerprint,
        now=now,
    )
    considered = {r.node_id for r in ranked}
    return _build_trace(
        trace_id=trace_id,
        notes=notes,
        graph_index=graph_index,
        hypotheses=hypotheses,
        ranked=ranked,
        min_root_score=min_root_score,
        considered=considered,
        alarms=state.active_alarms,
    )
