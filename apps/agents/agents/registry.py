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


def run_agent(name: str, inputs: dict[str, Any]) -> dict[str, Any]:
    """Return a DraftArtifact — never applied directly."""
    _assert_allowed(inputs)
    if name == "graph_draft":
        return _graph_draft(inputs)
    return {
        "artifact_type": name,
        "summary": f"Draft from {name} (stub)",
        "proposed_changes": [],
        "requires_human_approval": True,
    }


def _assert_allowed(inputs: dict[str, Any]) -> None:
    requested = inputs.get("tools") or []
    for tool in requested:
        if tool in FORBIDDEN_TOOLS:
            msg = f"forbidden tool: {tool}"
            raise PermissionError(msg)


def _graph_draft(inputs: dict[str, Any]) -> dict[str, Any]:
    prompt = str(inputs.get("prompt", ""))
    return {
        "artifact_type": "graph_draft",
        "summary": "Proposed causal edge based on operator context (draft only)",
        "proposed_changes": [
            {
                "change_type": "causal_edge",
                "from": "MOTOR_301_CURRENT",
                "to": "BUS_101_V",
                "note": prompt[:500] or "Operator requested graph review",
            }
        ],
        "requires_human_approval": True,
    }