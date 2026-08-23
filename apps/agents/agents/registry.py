"""Agent registry — draft-only, provider-agnostic.

Rule R5: AI is authoring assistant only. Never on the live diagnosis path.
Candidate edges are derived from observed alarm ordering — no fabrication.
The human engineer approves every proposed edge before it enters the runtime graph.
"""

from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Any

AGENT_TOOLS = frozenset(
    {
        "schema_search",
        "plant_context",
        "read_telemetry_history",
        "explain_alarms",
        "propose_threshold",
        "draft_rule",
        "draft_scenario",
        "draft_work_order",
        "retrieve_docs",
    }
)

FORBIDDEN_TOOLS = frozenset(
    {
        "write_modbus",
        "toggle_output",
        "arm_relay",
        "ack_device",
        "mutate_runtime",
        "approve_draft",
        "write_hardware",
    }
)

FORBIDDEN_CHANGE_TYPES = frozenset(
    {
        "hardware_write",
        "plc_output",
        "modbus_write",
        "relay_control",
        "runtime_mutation",
    }
)

_ALLOWED_EDGE_TYPES = frozenset(
    {
        "structural_power",
        "structural_load_effect",
        "signal",
        "thermal",
        "mechanical",
        "control",
        "cause_to_effect",
    }
)


def run_agent(name: str, inputs: dict[str, Any]) -> dict[str, Any]:
    """Return a DraftArtifact — never applied directly."""
    _assert_allowed(inputs)
    handlers = {
        "graph_draft": _graph_draft,
        "alarm_explainer": _alarm_explainer,
        "maintenance_planner": _maintenance_planner,
        "scenario_author": _scenario_author,
        "data_quality": _data_quality,
        "change_review": _change_review,
        "tag_mapper": _tag_mapper,
        "hmi_narrator": _hmi_narrator,
    }
    handler = handlers.get(name)
    if handler is None:
        return _service_unavailable(name)
    return handler(inputs)


def _assert_allowed(inputs: dict[str, Any]) -> None:
    requested = inputs.get("tools") or []
    for tool in requested:
        if tool in FORBIDDEN_TOOLS:
            msg = f"forbidden tool: {tool}"
            raise PermissionError(msg)


def _validate_output(payload: dict[str, Any]) -> None:
    for change in payload.get("proposed_changes", []):
        if change.get("change_type") in FORBIDDEN_CHANGE_TYPES:
            msg = f"forbidden change type: {change.get('change_type')}"
            raise ValueError(msg)


def _service_unavailable(agent_name: str) -> dict[str, Any]:
    return {
        "artifact_type": "service_unavailable",
        "summary": "Agent service unavailable. Runtime unaffected.",
        "proposed_changes": [],
        "requires_human_approval": True,
        "explanation": f"Agent '{agent_name}' has no live provider configured.",
        "validation_status": "pending",
        "risk_level": "unknown",
    }


# ---------------------------------------------------------------------------
# Candidate generation helpers (deterministic — no LLM required)
# ---------------------------------------------------------------------------


def _estimate_lag_ms(ts1: str | None, ts2: str | None) -> list[int]:
    if not ts1 or not ts2:
        return [0, 5000]
    try:
        dt1 = datetime.fromisoformat(ts1.replace("Z", "+00:00"))
        dt2 = datetime.fromisoformat(ts2.replace("Z", "+00:00"))
        delta = max(0, int((dt2 - dt1).total_seconds() * 1000))
        margin = max(500, delta // 2)
        return [max(0, delta - margin), delta + margin]
    except Exception:
        return [0, 5000]


def _infer_edge_type(alarm_id: str | None) -> str:
    if alarm_id:
        al = alarm_id.upper()
        if any(k in al for k in ("CURRENT", "RPM", "VIB", "MECH")):
            return "mechanical"
        if any(k in al for k in ("TEMP", "THERMAL")):
            return "thermal"
        if any(k in al for k in ("VOLTAGE", "POWER", "BUS")):
            return "structural_load_effect"
    return "cause_to_effect"


def _edge_id(from_id: str, to_id: str, evidence_id: str) -> str:
    token = hashlib.sha256(f"{from_id}_{to_id}_{evidence_id}".encode()).hexdigest()[:6].upper()
    return f"E_AGENT_{token}"


def _build_candidates(evidence: dict[str, Any]) -> list[dict[str, Any]]:
    """Derive add_causal_edge proposals from alarm ordering in a RuntimeEvidencePacket."""
    chain = evidence.get("evidence_chain", [])
    evidence_id = evidence.get("evidence_id", "UNKNOWN")
    base_confidence = min(0.75, float(evidence.get("confidence", 0.5)) * 0.85)

    first_signals = [item for item in chain if item.get("role") == "first_signal"]
    downstream = [item for item in chain if item.get("role") == "downstream_effect"]

    if not first_signals or not downstream:
        return []

    traversed: set[tuple[str, str]] = {
        (e.get("from_asset_id", ""), e.get("to_asset_id", ""))
        for e in evidence.get("causal_path", [])
    }

    proposals: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()

    for cause in first_signals:
        cause_id = cause.get("asset_id", "")
        if not cause_id:
            continue
        for effect in downstream:
            effect_id = effect.get("asset_id", "")
            if not effect_id or cause_id == effect_id:
                continue
            if (cause_id, effect_id) in seen or (cause_id, effect_id) in traversed:
                continue
            seen.add((cause_id, effect_id))

            lag_ms = _estimate_lag_ms(cause.get("first_seen_ts"), effect.get("first_seen_ts"))
            edge_type = _infer_edge_type(cause.get("alarm_id"))
            eid = _edge_id(cause_id, effect_id, evidence_id)
            evidence_refs = [
                a for a in [cause.get("alarm_id"), effect.get("alarm_id")] if a
            ]

            proposals.append(
                {
                    "change_type": "add_causal_edge",
                    "target_path": "/causal_graph/edges",
                    "patch": {
                        "id": eid,
                        "from": cause_id,
                        "to": effect_id,
                        "edge_type": edge_type,
                        "approved": False,
                        "lag_ms": lag_ms,
                        "weight": round(min(1.0, base_confidence + 0.05), 3),
                        "confidence": round(base_confidence, 3),
                        "provenance": "agent_proposed",
                    },
                    "rationale": (
                        f"{cause.get('alarm_id', cause_id)} on {cause_id} observed "
                        f"before {effect.get('alarm_id', effect_id)} on {effect_id}. "
                        f"Source: evidence packet {evidence_id}."
                    ),
                    "evidence_refs": evidence_refs,
                    "risk_level": "medium",
                }
            )

    return proposals


# ---------------------------------------------------------------------------
# Agent implementations
# ---------------------------------------------------------------------------


def _graph_draft(inputs: dict[str, Any]) -> dict[str, Any]:
    """Generate deterministic causal edge candidates from a RuntimeEvidencePacket.

    Candidates are derived solely from alarm ordering and causal path in the evidence.
    Confidence is capped at 0.75 — agents never claim certainty.
    All proposed edges have approved=false and provenance=agent_proposed.
    A human engineer must approve every edge before runtime use.
    """
    evidence = inputs.get("context", {}).get("evidence_packet")
    if not evidence:
        return _service_unavailable("graph_draft")

    candidates = _build_candidates(evidence)
    evidence_id = evidence.get("evidence_id", "")

    payload = {
        "artifact_type": "graph_draft",
        "summary": (
            f"Detected {len(candidates)} candidate causal edge(s) from evidence {evidence_id}."
            if candidates
            else f"No new edge candidates found in evidence {evidence_id}. All observed paths already exist in the causal graph."
        ),
        "proposed_changes": candidates,
        "source_evidence_ids": [evidence_id] if evidence_id else [],
        "requires_human_approval": True,
        "explanation": (
            "Candidates generated deterministically from alarm ordering in the evidence packet. "
            "Confidence capped at 0.75. All edges require human validation and runtime approval."
        ),
        "validation_status": "pending",
        "risk_level": "medium",
    }
    _validate_output(payload)
    return payload


def _alarm_explainer(inputs: dict[str, Any]) -> dict[str, Any]:
    evidence = inputs.get("context", {}).get("evidence_packet")
    if not evidence:
        return _service_unavailable("alarm_explainer")
    chain = evidence.get("evidence_chain", [])
    if not chain:
        return _service_unavailable("alarm_explainer")
    first = chain[0]
    explanation = (
        f"First signal: {first.get('explanation', first.get('alarm_id'))} "
        f"on asset {first.get('asset_id')} at {first.get('first_seen_ts')}. "
        f"Root candidate: {evidence.get('root_asset_id') or 'none'}. "
        "This explanation references deterministic evidence only."
    )
    payload = {
        "artifact_type": "alarm_explanation",
        "summary": explanation,
        "proposed_changes": [],
        "requires_human_approval": True,
        "explanation": explanation,
        "validation_status": "valid",
        "risk_level": "low",
    }
    _validate_output(payload)
    return payload


def _require_evidence(inputs: dict[str, Any], agent_name: str) -> dict[str, Any] | None:
    evidence = inputs.get("context", {}).get("evidence_packet")
    if not evidence:
        return None
    return evidence


def _draft_stub(
    *,
    agent_name: str,
    artifact_type: str,
    summary: str,
    explanation: str,
    evidence: dict[str, Any],
    proposed_changes: list[dict[str, Any]] | None = None,
    risk_level: str = "medium",
) -> dict[str, Any]:
    evidence_id = evidence.get("evidence_id", "")
    payload = {
        "artifact_type": artifact_type,
        "summary": summary,
        "proposed_changes": proposed_changes or [],
        "source_evidence_ids": [evidence_id] if evidence_id else [],
        "requires_human_approval": True,
        "explanation": explanation,
        "validation_status": "pending",
        "risk_level": risk_level,
        "agent": agent_name,
    }
    _validate_output(payload)
    return payload


def _maintenance_planner(inputs: dict[str, Any]) -> dict[str, Any]:
    evidence = _require_evidence(inputs, "maintenance_planner")
    if not evidence:
        return _service_unavailable("maintenance_planner")
    root = evidence.get("root_asset_id") or "unknown"
    rec = (evidence.get("recommended_checks") or ["Inspect root asset isolation state"])[0]
    return _draft_stub(
        agent_name="maintenance_planner",
        artifact_type="work_order_draft",
        summary=f"Draft work order for {root}.",
        explanation=(
            f"Proposed maintenance check for {root} from evidence "
            f"{evidence.get('evidence_id')}: {rec}. Draft only — requires human approval."
        ),
        evidence=evidence,
        proposed_changes=[
            {
                "change_type": "draft_work_order",
                "target_path": "/maintenance/work_orders",
                "patch": {
                    "asset_id": root,
                    "title": f"Inspect {root}",
                    "priority": "medium",
                    "source_evidence_id": evidence.get("evidence_id"),
                },
                "rationale": f"Derived from evidence packet {evidence.get('evidence_id')}.",
                "evidence_refs": evidence.get("active_alarm_ids", [])[:4],
                "risk_level": "medium",
            }
        ],
    )


def _scenario_author(inputs: dict[str, Any]) -> dict[str, Any]:
    evidence = _require_evidence(inputs, "scenario_author")
    if not evidence:
        return _service_unavailable("scenario_author")
    sit = evidence.get("situation_type") or "UNKNOWN"
    return _draft_stub(
        agent_name="scenario_author",
        artifact_type="scenario_draft",
        summary=f"Draft regression scenario for {sit}.",
        explanation=(
            f"Scenario draft scaffolding from evidence {evidence.get('evidence_id')}. "
            "Events and thresholds must be filled before scenarios.json."
        ),
        evidence=evidence,
        proposed_changes=[
            {
                "change_type": "draft_scenario",
                "target_path": "/scenarios",
                "patch": {
                    "id": f"scn_draft_{sit.lower()}",
                    "expected_situation": sit,
                    "expected_root_cause": evidence.get("root_asset_id"),
                },
                "rationale": "Scaffolded from RuntimeEvidencePacket — not a live diagnosis.",
                "evidence_refs": [evidence.get("evidence_id", "")],
                "risk_level": "low",
            }
        ],
        risk_level="low",
    )


def _data_quality(inputs: dict[str, Any]) -> dict[str, Any]:
    evidence = _require_evidence(inputs, "data_quality")
    if not evidence:
        return _service_unavailable("data_quality")
    stale = evidence.get("stale_or_bad_tags") or []
    missing = evidence.get("missing_tags") or []
    return _draft_stub(
        agent_name="data_quality",
        artifact_type="data_quality_report",
        summary=f"{len(stale)} stale/bad and {len(missing)} missing tag(s).",
        explanation=(
            "Data quality draft from evidence packet only. "
            f"Stale/bad: {', '.join(stale[:8]) or 'none'}. "
            f"Missing: {', '.join(missing[:8]) or 'none'}. "
            "No root-cause claim is made from quality alone."
        ),
        evidence=evidence,
        proposed_changes=[],
        risk_level="low",
    )


def _change_review(inputs: dict[str, Any]) -> dict[str, Any]:
    evidence = _require_evidence(inputs, "change_review")
    if not evidence:
        return _service_unavailable("change_review")
    pending = inputs.get("context", {}).get("pending_changes") or []
    return _draft_stub(
        agent_name="change_review",
        artifact_type="change_review_draft",
        summary=f"Review checklist for {len(pending)} pending change(s).",
        explanation=(
            "Change review stub. Verify approved=false edges, compile status, and HITL approval "
            f"against evidence {evidence.get('evidence_id')}."
        ),
        evidence=evidence,
        proposed_changes=[],
        risk_level="low",
    )


def _tag_mapper(inputs: dict[str, Any]) -> dict[str, Any]:
    evidence = _require_evidence(inputs, "tag_mapper")
    if not evidence:
        return _service_unavailable("tag_mapper")
    hints = inputs.get("context", {}).get("tag_hints") or evidence.get("active_alarm_ids") or []
    return _draft_stub(
        agent_name="tag_mapper",
        artifact_type="tag_map_draft",
        summary=f"Tag mapping draft with {len(hints)} hint(s).",
        explanation=(
            "Tag mapper draft stub. Candidates require engineer approval via offline ingest / Studio "
            "before any tag_map commit."
        ),
        evidence=evidence,
        proposed_changes=[
            {
                "change_type": "draft_tag_binding",
                "target_path": "/tag_map/tags",
                "patch": {"hints": list(hints)[:12], "requires_human_approval": True},
                "rationale": "Hints only — not applied to live tag map.",
                "evidence_refs": [evidence.get("evidence_id", "")],
                "risk_level": "medium",
            }
        ],
    )


def _hmi_narrator(inputs: dict[str, Any]) -> dict[str, Any]:
    evidence = _require_evidence(inputs, "hmi_narrator")
    if not evidence:
        return _service_unavailable("hmi_narrator")
    root = evidence.get("root_asset_id") or "unknown"
    sit = evidence.get("situation_type") or "Active Situation"
    narration = (
        f"{sit} on {root}. Confidence {float(evidence.get('confidence', 0)):.0%}. "
        f"Trace {evidence.get('deterministic_trace_id', 'n/a')}. "
        "Narration only — diagnosis remains the approved DAG."
    )
    return _draft_stub(
        agent_name="hmi_narrator",
        artifact_type="hmi_narration",
        summary=narration,
        explanation=narration,
        evidence=evidence,
        proposed_changes=[],
        risk_level="low",
    )