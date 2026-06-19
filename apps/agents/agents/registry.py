"""Agent registry — draft-only, provider-agnostic."""

from __future__ import annotations

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


def run_agent(name: str, inputs: dict[str, Any]) -> dict[str, Any]:
    """Return a DraftArtifact — never applied directly."""
    _assert_allowed(inputs)
    if name == "graph_draft":
        return _graph_draft(inputs)
    if name == "alarm_explainer":
        return _alarm_explainer(inputs)
    return _service_unavailable(name)


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


def _graph_draft(inputs: dict[str, Any]) -> dict[str, Any]:
    """No fabricated edges — return unavailable unless evidence-backed draft is implemented."""
    evidence = inputs.get("context", {}).get("evidence_packet")
    if not evidence:
        return _service_unavailable("graph_draft")
    return {
        "artifact_type": "graph_draft",
        "summary": "Graph draft request received — requires human review before any edge is approved.",
        "proposed_changes": [],
        "requires_human_approval": True,
        "explanation": "No automatic causal edge proposed. Review evidence packet and author changes in Studio.",
        "source_evidence_ids": [evidence.get("evidence_id")] if evidence.get("evidence_id") else [],
        "validation_status": "pending",
        "risk_level": "medium",
    }


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