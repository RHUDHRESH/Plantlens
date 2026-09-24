"""Collapse alarm floods into coherent Situation records."""

from __future__ import annotations

import dataclasses
from datetime import datetime, timezone
from typing import Any

from app.runtime.causal.confidence import confidence_bucket
from app.runtime.dag_runtime import (
    DEFAULT_MIN_ROOT_SCORE,
    RootCauseTrace,
    diagnose_flood,
    evaluate_conditions,
)
from app.runtime.runtime_state import RuntimeState


def _has_non_good_evidence(state: RuntimeState) -> bool:
    for frame in state.tags.values():
        if frame.quality in {"STALE", "MISSING", "BAD"}:
            return True
    return False


def _match_situation_type(
    root_asset_id: str,
    root_score: float,
    alarm_ids: set[str],
    graph_index: dict[str, Any],
    state: RuntimeState,
) -> dict[str, Any] | None:
    """Infer situation_type from authored causal_graph.situation_types — fail closed."""
    for spec in graph_index.get("situation_types", []):
        if spec.get("root_asset_id") != root_asset_id:
            continue
        if root_score < float(spec.get("min_root_score", DEFAULT_MIN_ROOT_SCORE)):
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


def _confidence_bucket(score: float) -> str:
    return confidence_bucket(score)


def evaluate_situations(
    state: RuntimeState,
    active_alarms: list[dict[str, Any]],
    graph_index: dict[str, Any],
    *,
    now: datetime | None = None,
    asset_index: dict[str, dict[str, Any]] | None = None,
) -> tuple[list[dict[str, Any]], RootCauseTrace | None]:
    """Return situations and the root-cause trace used to build them."""
    if not active_alarms:
        return [], None

    alarm_map = {alarm["alarm_id"]: alarm for alarm in active_alarms}
    state.active_alarms = alarm_map

    if _has_non_good_evidence(state):
        good_alarm_tags = [
            alarm
            for alarm in active_alarms
            if (tag := state.get_tag(alarm.get("tag_id", ""))) is not None and tag.quality == "GOOD"
        ]
        if not good_alarm_tags:
            return [], None

    trace = diagnose_flood(graph_index, state, now=now)
    if trace.selected_root is None:
        return [], trace

    created_at = now or datetime.now(timezone.utc)
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    situations: list[dict[str, Any]] = []
    primary_trace: RootCauseTrace | None = None
    for hypothesis in trace.roots:
        root_id = hypothesis.node_id
        # Alarms this root explains; a situation never swallows another root's alarms.
        scoped = [a for a in active_alarms if a["alarm_id"] in set(hypothesis.explained)]
        alarm_ids = {a["alarm_id"] for a in scoped}
        spec = _match_situation_type(root_id, hypothesis.confidence, alarm_ids, graph_index, state)
        if spec is None:
            continue
        score = next((r for r in trace.scores if r.node_id == root_id), None)
        situation_type = spec["id"]
        root_name = asset_index[root_id].get("display_name") if asset_index and root_id in asset_index else None
        situations.append(
            {
                "situation_id": f"SIT_{situation_type}",
                "situation_type": situation_type,
                "title": spec.get("title", situation_type.replace("_", " ").title()),
                "severity": _worst_severity(scoped),
                "root_asset_id": root_id,
                "root_asset_name": root_name,
                "confidence": hypothesis.bucket,
                "confidence_score": hypothesis.confidence,
                "confidence_reason": trace.confidence_reason
                if root_id == trace.selected_root
                else "; ".join(score.reasons if score else ()),
                "created_at": created_at.isoformat().replace("+00:00", "Z"),
                "grouped_alarm_ids": sorted(alarm_ids),
                "affected_asset_ids": sorted({a["asset_id"] for a in scoped if a.get("asset_id")}),
                "causal_path": _build_causal_path(root_id, graph_index, scoped, spec),
                "traversed_edges": list(score.path_edges) if score else [],
                "evidence": _build_evidence(scoped, spec.get("evidence_order")),
                "score_breakdown": {
                    "timing": score.timing,
                    "coverage": score.coverage,
                    "fingerprint": score.fingerprint,
                    "quality_penalty": score.quality_penalty,
                    "contradictions": score.contradictions,
                    "margin": hypothesis.margin,
                    "competitor": hypothesis.competitor,
                }
                if score
                else None,
                "loop_note": score.loop_note if score else None,
                "unexplained_alarm_ids": sorted(set(a["alarm_id"] for a in active_alarms) - alarm_ids),
                "rejected_candidates": [
                    {
                        "asset_id": r.asset_id,
                        "reason": r.reason,
                        "score": r.score,
                        "missing_evidence": list(r.missing_evidence),
                        "contradicted_by": list(r.contradicted_by),
                    }
                    for r in trace.rejected_candidates
                    if r.asset_id != root_id
                ],
                "deterministic_trace_id": trace.trace_id,
            }
        )
        if primary_trace is None:
            primary_trace = (
                trace
                if root_id == trace.selected_root
                else dataclasses.replace(
                    trace,
                    selected_root=root_id,
                    confidence=hypothesis.confidence,
                    confidence_bucket=hypothesis.bucket,
                )
            )
    return situations, primary_trace or trace


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
    root_asset_id: str,
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
    if root_asset_id not in path_assets:
        path_assets.insert(0, root_asset_id)
    elif path_assets[0] != root_asset_id:
        path_assets = [root_asset_id] + [a for a in path_assets if a != root_asset_id]
    return path_assets