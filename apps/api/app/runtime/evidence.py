"""Build canonical RuntimeEvidencePacket from deterministic runtime outputs."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from app.runtime.dag_runtime import RootCauseTrace
from app.runtime.quality import collect_data_quality_notes
from app.schemas.runtime_evidence import (
    CausalPathEdge,
    EvidenceChainItem,
    RejectedCandidate,
    RuntimeEvidencePacket,
)


def _parse_ts(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        ts = value
    else:
        ts = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts


def build_evidence_chain(
    active_alarms: list[dict[str, Any]],
    state_tags: dict[str, Any],
    evidence_order: list[str] | None,
    root_asset_id: str | None,
) -> list[EvidenceChainItem]:
    alarm_by_id = {a["alarm_id"]: a for a in active_alarms}
    if evidence_order:
        ordered = [alarm_by_id[aid] for aid in evidence_order if aid in alarm_by_id]
        remaining = [a for a in active_alarms if a["alarm_id"] not in evidence_order]
        ordered.extend(
            sorted(remaining, key=lambda a: (_parse_ts(a["raised_at"]), a["alarm_id"]))
        )
    else:
        ordered = sorted(active_alarms, key=lambda a: (_parse_ts(a["raised_at"]), a["alarm_id"]))

    chain: list[EvidenceChainItem] = []
    for index, alarm in enumerate(ordered):
        tag_id = alarm.get("tag_id", "")
        frame = state_tags.get(tag_id)
        quality = getattr(frame, "quality", "GOOD") if frame else "MISSING"
        asset_id = alarm.get("asset_id", "")
        if index == 0:
            role = "first_signal"
        elif root_asset_id and asset_id == root_asset_id:
            role = "supporting_signal"
        elif root_asset_id and asset_id != root_asset_id:
            role = "downstream_effect"
        else:
            role = "supporting_signal"

        chain.append(
            EvidenceChainItem(
                order=index + 1,
                tag_id=tag_id or None,
                asset_id=asset_id,
                signal_name=alarm.get("message"),
                observed_value=alarm.get("value"),
                unit=None,
                threshold=None,
                comparator=None,
                alarm_id=alarm["alarm_id"],
                first_seen_ts=_parse_ts(alarm["raised_at"]),
                quality=quality,
                role=role,
                explanation=alarm.get("message", alarm["alarm_id"]),
            )
        )
    return chain


def build_causal_path_edges(
    path_asset_ids: list[str],
    graph_index: dict[str, Any],
    active_alarms: list[dict[str, Any]],
) -> list[CausalPathEdge]:
    if len(path_asset_ids) < 2:
        return []

    alarm_by_asset: dict[str, dict[str, Any]] = {}
    for alarm in active_alarms:
        aid = alarm.get("asset_id")
        if aid and aid not in alarm_by_asset:
            alarm_by_asset[aid] = alarm

    edges_out: list[CausalPathEdge] = []
    edges_by_id = graph_index.get("edges_by_id", {})
    forward = graph_index.get("forward_adjacency", {})

    for i in range(len(path_asset_ids) - 1):
        from_id = path_asset_ids[i]
        to_id = path_asset_ids[i + 1]
        matching = None
        for edge in forward.get(from_id, []):
            if edge.to_node == to_id:
                matching = edge
                break
        if matching is None:
            continue
        raw = edges_by_id.get(matching.id, {})
        cause_alarm = alarm_by_asset.get(from_id)
        effect_alarm = alarm_by_asset.get(to_id)
        observed_lag = None
        if cause_alarm and effect_alarm:
            observed_lag = (
                _parse_ts(effect_alarm["raised_at"]) - _parse_ts(cause_alarm["raised_at"])
            ).total_seconds() * 1000
        edges_out.append(
            CausalPathEdge(
                from_asset_id=from_id,
                to_asset_id=to_id,
                edge_id=matching.id,
                approved=matching.approved,
                lag_ms=matching.lag_ms,
                observed_lag_ms=observed_lag,
                relation_type=matching.edge_type,
                explanation=f"Approved edge {matching.id} on causal path",
            )
        )
    return edges_out


def build_runtime_evidence_packet(
    *,
    plant_id: str,
    runtime_bundle_version: str,
    ts: datetime,
    trace: RootCauseTrace,
    situation: dict[str, Any] | None,
    active_alarms: list[dict[str, Any]],
    state_tags: dict[str, Any],
    graph_index: dict[str, Any],
    blocked_actions: list[dict[str, Any]],
    recommended_checks: list[dict[str, Any]],
    projection: dict[str, Any] | None = None,
    audit_receipt_id: str | None = None,
) -> RuntimeEvidencePacket:
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)

    stale_or_bad: list[str] = []
    missing: list[str] = []
    for tag_id, frame in state_tags.items():
        q = getattr(frame, "quality", "GOOD")
        if q in {"STALE", "BAD"}:
            stale_or_bad.append(tag_id)
        elif q == "MISSING":
            missing.append(tag_id)

    evidence_order = None
    if situation:
        spec_id = situation.get("situation_type")
        for spec in graph_index.get("situation_types", []):
            if spec.get("id") == spec_id:
                evidence_order = spec.get("evidence_order")
                break

    root_id = trace.selected_root
    chain = build_evidence_chain(active_alarms, state_tags, evidence_order, root_id)
    path_assets = situation.get("causal_path", []) if situation else []
    causal_edges = build_causal_path_edges(path_assets, graph_index, active_alarms)

    rejected = [
        RejectedCandidate(
            asset_id=r.asset_id,
            reason=r.reason,
            score=r.score,
            missing_evidence=list(r.missing_evidence),
            contradicted_by=list(r.contradicted_by),
        )
        for r in trace.rejected_candidates
    ]

    alarm_ids = sorted({a["alarm_id"] for a in active_alarms})
    grouped = situation.get("grouped_alarm_ids", []) if situation else []

    return RuntimeEvidencePacket(
        evidence_id=f"EV_{uuid.uuid4().hex[:12].upper()}",
        plant_id=plant_id,
        ts=ts,
        runtime_bundle_version=runtime_bundle_version,
        source_frame_ids=sorted(state_tags.keys()),
        active_alarm_ids=alarm_ids,
        grouped_alarm_ids=sorted(grouped) if grouped else alarm_ids,
        root_asset_id=root_id,
        root_cause_candidate_id=root_id,
        situation_id=situation.get("situation_id") if situation else None,
        situation_type=situation.get("situation_type") if situation else None,
        confidence=trace.confidence,
        confidence_reason=trace.confidence_reason,
        evidence_chain=chain,
        causal_path=causal_edges,
        rejected_candidates=rejected,
        stale_or_bad_tags=sorted(stale_or_bad),
        missing_tags=sorted(missing),
        blocked_actions=blocked_actions,
        recommended_checks=recommended_checks,
        time_to_consequence=projection,
        audit_receipt_id=audit_receipt_id,
        deterministic_trace_id=trace.trace_id,
    )


def packet_to_dict(packet: RuntimeEvidencePacket) -> dict[str, Any]:
    return packet.model_dump(mode="json")