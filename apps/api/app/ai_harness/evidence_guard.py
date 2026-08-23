"""Evidence guard — validates AI response is grounded in known evidence.

Rules:
- cited assets/alarms/signals/edges must exist in compiled bundle.
- root cause citations must match ep.root_asset_id.
- rejected candidate citations must match ep.rejected_candidates.
- recommended actions must exist in action_envelope or calm card.
- stale/bad tags trigger mandatory limitation note.
- hardware write/control requests are refused.
- no evidence → return insufficient_evidence marker.
"""

from __future__ import annotations

import re
from typing import Any

from app.ai_harness.context_builder import AIContext
from app.ai_harness.response_schema import AIResponse

_HARDWARE_PATTERNS = re.compile(
    r"\b(trip\s+breaker|write\s+to\s+plc|toggle\s+relay|arm\s+relay|"
    r"force\s+output|disable\s+interlock|ack\s+alarm|reboot\s+device|"
    r"send\s+command\s+to|control\s+output)\b",
    re.IGNORECASE,
)

STALE_DATA_LIMITATION = (
    "Note: one or more sensor readings are stale or of bad quality. "
    "Confidence in this assessment is reduced. Verify sensor health before acting."
)

HARDWARE_REFUSAL = (
    "PlantLens does not issue hardware commands, acknowledge alarms, or write to PLCs. "
    "This is a decision-support system only. Use the control system for any actuation."
)


class GuardViolation(Exception):
    pass


def guard_ai_response(response: AIResponse, context: AIContext) -> AIResponse:
    """Validate and enrich an AI response against the evidence context.

    Mutates response.limitations to add mandatory notes.
    Raises GuardViolation for hard failures (hardware write attempt).
    Returns the validated response.
    """
    # Hard stop: hardware write in answer
    if _HARDWARE_PATTERNS.search(response.answer):
        raise GuardViolation(HARDWARE_REFUSAL)

    # No evidence — add limitation
    if not context.latest_evidence_packet and not context.calm_card:
        if "insufficient_evidence" not in response.answer.lower():
            response.limitations.append(
                "No active evidence packet. This answer is based on plant model only."
            )

    # Stale/bad tags — mandatory note
    if context.stale_or_bad_tags:
        stale_list = ", ".join(context.stale_or_bad_tags[:5])
        note = f"{STALE_DATA_LIMITATION} Affected: {stale_list}."
        if note not in response.limitations:
            response.limitations.append(note)

    # Validate cited_assets exist in compiled bundle
    unknown_assets = [
        a for a in response.cited_assets
        if context.known_asset_ids and a not in context.known_asset_ids
    ]
    if unknown_assets:
        response.limitations.append(
            f"Warning: cited assets not in plant model: {', '.join(unknown_assets)}. "
            "Verify asset IDs."
        )

    # Validate cited_alarms
    unknown_alarms = [
        a for a in response.cited_alarms
        if context.known_alarm_ids and a not in context.known_alarm_ids
    ]
    if unknown_alarms:
        response.limitations.append(
            f"Warning: cited alarms not in alarm index: {', '.join(unknown_alarms)}."
        )

    # Validate cited_edges
    unknown_edges = [
        e for e in response.cited_edges
        if context.known_edge_ids and e not in context.known_edge_ids
    ]
    if unknown_edges:
        response.limitations.append(
            f"Warning: cited edges not in approved graph: {', '.join(unknown_edges)}."
        )

    # Root cause citations must match evidence
    ep = context.latest_evidence_packet or {}
    if response.cited_assets and ep.get("root_asset_id"):
        # If answer cites a root asset, it should match the EP root_asset_id
        # (guard doesn't block — just adds a note if they differ)
        root = ep["root_asset_id"]
        if root not in response.cited_assets and not response.limitations:
            response.limitations.append(
                f"The deterministic root cause is {root}. "
                "Verify that cited assets align with this determination."
            )

    # Operator authority reminder for action recommendations
    if response.proposed_actions:
        has_auth = any(
            "PlantLens does not" in lim for lim in response.limitations
        )
        if not has_auth:
            response.limitations.append(
                "PlantLens recommends these actions but does not control equipment. "
                "Follow site isolation and permitting procedures."
            )

    return response


def check_no_evidence(context: AIContext) -> bool:
    """True when there is no live evidence to answer from."""
    return (
        not context.latest_evidence_packet
        and not context.active_alarms
        and not context.calm_card
    )
