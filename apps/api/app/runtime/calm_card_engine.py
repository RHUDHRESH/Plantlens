"""Build deterministic Calm Cards from RuntimeEvidencePacket."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.schemas.runtime_evidence import RuntimeEvidencePacket

OPERATOR_AUTHORITY = (
    "PlantLens does not trip or control equipment. "
    "It provides evidence-backed decision support."
)


def build_why_it_matters(packet: RuntimeEvidencePacket, situation_spec: dict[str, Any] | None) -> str:
    if situation_spec and situation_spec.get("why_it_matters"):
        return str(situation_spec["why_it_matters"])
    if packet.confidence_reason:
        return packet.confidence_reason
    return "PlantLens grouped related alarms into one situation based on the approved causal graph."


def select_recommended_action(
    situation_type: str | None,
    action_envelope: dict[str, Any],
    *,
    preferred_action_id: str | None = None,
) -> dict[str, Any]:
    actions = action_envelope.get("actions", [])
    if preferred_action_id:
        for action in actions:
            if action.get("id") == preferred_action_id:
                return {
                    "action_id": action["id"],
                    "label": action["label"],
                    "risk_level": action.get("risk_level", "unknown"),
                    "requires_isolation": bool(action.get("requires_isolation", False)),
                }
    if not situation_type:
        return _fallback_action()
    for action in actions:
        if situation_type in action.get("situation_ids", []):
            return {
                "action_id": action["id"],
                "label": action["label"],
                "risk_level": action.get("risk_level", "unknown"),
                "requires_isolation": bool(action.get("requires_isolation", False)),
            }
    return _fallback_action()


def _matrix_overlay(packet: RuntimeEvidencePacket) -> dict[str, Any]:
    scores = list(packet.fault_matrix_scores or [])
    if not scores:
        return {
            "fault_matrix_top": None,
            "fault_matrix_scores": [],
        }
    top = scores[0]
    top_dict = top.model_dump() if hasattr(top, "model_dump") else dict(top)
    return {
        "fault_matrix_top": {
            "fault_id": top_dict.get("fault_id"),
            "fault_name": top_dict.get("fault_name"),
            "asset_id": top_dict.get("asset_id"),
            "confidence": top_dict.get("confidence"),
            "coverage": top_dict.get("coverage"),
            "contradicted": top_dict.get("contradicted", False),
            "supporting_symptoms": top_dict.get("supporting_symptoms", []),
            "contradicting_symptoms": top_dict.get("contradicting_symptoms", []),
            "safe_action_id": top_dict.get("safe_action_id"),
        },
        "fault_matrix_scores": [
            (s.model_dump() if hasattr(s, "model_dump") else dict(s)) for s in scores[:5]
        ],
    }


def _fallback_action() -> dict[str, Any]:
    return {
        "action_id": "REVIEW_RAW_ALARMS",
        "label": "Review raw alarms and evidence chain",
        "risk_level": "low",
        "requires_isolation": False,
    }


def find_blocked_actions(
    situation_type: str | None,
    active_alarm_ids: set[str],
    action_envelope: dict[str, Any],
) -> list[dict[str, Any]]:
    if not situation_type:
        return []
    blocked: list[dict[str, Any]] = []
    for action in action_envelope.get("actions", []):
        if situation_type not in action.get("situation_ids", []):
            continue
        blocked_if = set(action.get("blocked_if", []))
        overlap = blocked_if & active_alarm_ids
        if overlap:
            blocked.append(
                {
                    "action_id": action["id"],
                    "label": action["label"],
                    "reason": action.get(
                        "blocked_message",
                        f"Blocked while alarms active: {', '.join(sorted(overlap))}",
                    ),
                }
            )
    return blocked


def build_calm_card_from_evidence(
    packet: RuntimeEvidencePacket,
    action_envelope: dict[str, Any],
    *,
    situation_spec: dict[str, Any] | None = None,
    severity: str = "warning",
) -> dict[str, Any]:
    """Primary Calm Card builder — renders from evidence packet only."""
    first_item = packet.evidence_chain[0] if packet.evidence_chain else None
    evidence_chain = [
        {
            "order": item.order,
            "alarm_id": item.alarm_id,
            "asset_id": item.asset_id,
            "message": item.explanation or item.signal_name or item.alarm_id,
            "timestamp": item.first_seen_ts.isoformat().replace("+00:00", "Z"),
        }
        for item in packet.evidence_chain
    ]

    first_signal = None
    if first_item is not None:
        first_signal = {
            "alarm_id": first_item.alarm_id,
            "asset_id": first_item.asset_id,
            "timestamp": first_item.first_seen_ts.isoformat().replace("+00:00", "Z"),
            "message": first_item.explanation or first_item.signal_name or first_item.alarm_id,
            "tag_id": first_item.tag_id,
            "value": first_item.observed_value,
            "unit": first_item.unit,
        }

    active_alarm_ids = set(packet.active_alarm_ids)
    overlay = _matrix_overlay(packet)
    preferred_safe = None
    top = overlay.get("fault_matrix_top") or {}
    if top and not top.get("contradicted"):
        preferred_safe = top.get("safe_action_id")

    recommended = packet.recommended_checks[0] if packet.recommended_checks else select_recommended_action(
        packet.situation_type,
        action_envelope,
        preferred_action_id=preferred_safe,
    )
    # Prefer matrix safe_action when it exists in the envelope and confidence is meaningful.
    if preferred_safe and (top.get("confidence") or 0) >= 0.45:
        matrix_rec = select_recommended_action(
            packet.situation_type,
            action_envelope,
            preferred_action_id=preferred_safe,
        )
        if matrix_rec.get("action_id") == preferred_safe:
            recommended = matrix_rec

    blocked = packet.blocked_actions or find_blocked_actions(
        packet.situation_type, active_alarm_ids, action_envelope
    )

    confidence_label = "low"
    if packet.confidence >= 0.75:
        confidence_label = "high"
    elif packet.confidence >= 0.45:
        confidence_label = "medium"

    return {
        "card_id": f"CC_{packet.situation_id or packet.evidence_id}",
        "situation_id": packet.situation_id or packet.evidence_id,
        "title": situation_spec.get("title", packet.situation_type or "Active situation")
        if situation_spec
        else (packet.situation_type or "Active situation").replace("_", " ").title(),
        "severity": severity,
        "root_asset_id": packet.root_asset_id or "",
        "root_asset_name": None,
        "confidence": confidence_label,
        "confidence_reason": packet.confidence_reason,
        "created_at": packet.ts.isoformat().replace("+00:00", "Z"),
        "first_signal": first_signal,
        "evidence_chain": evidence_chain,
        "why_it_matters": build_why_it_matters(packet, situation_spec),
        "recommended_first_check": recommended,
        "blocked_actions": blocked,
        "time_to_consequence": packet.time_to_consequence,
        "raw_alarm_count": len(packet.grouped_alarm_ids),
        "raw_alarm_ids": packet.grouped_alarm_ids,
        "operator_authority": OPERATOR_AUTHORITY,
        "evidence_id": packet.evidence_id,
        "audit_receipt_id": packet.audit_receipt_id,
        **overlay,
    }


def build_calm_card(
    situation: dict[str, Any],
    alarm_events: list[dict[str, Any]],
    action_envelope: dict[str, Any],
    *,
    projection: dict[str, Any] | None = None,
    evidence_packet: RuntimeEvidencePacket | None = None,
) -> dict[str, Any]:
    """Backward-compatible entry — prefers evidence packet when provided."""
    if evidence_packet is not None:
        spec = None
        return build_calm_card_from_evidence(
            evidence_packet,
            action_envelope,
            situation_spec=spec,
        )

    # Legacy path for tests that pass situation dict directly
    evidence = situation.get("evidence", [])
    first = evidence[0] if evidence else None
    evidence_chain = [
        {
            "order": index + 1,
            "alarm_id": item["alarm_id"],
            "asset_id": item["asset_id"],
            "message": item.get("reason", item["alarm_id"]),
            "timestamp": item["timestamp"],
        }
        for index, item in enumerate(evidence)
    ]

    first_signal = None
    if first is not None:
        matching_alarm = next(
            (alarm for alarm in alarm_events if alarm["alarm_id"] == first["alarm_id"]),
            None,
        )
        first_signal = {
            "alarm_id": first["alarm_id"],
            "asset_id": first["asset_id"],
            "timestamp": first["timestamp"],
            "message": first.get("reason", first["alarm_id"]),
            "tag_id": matching_alarm.get("tag_id") if matching_alarm else None,
            "value": matching_alarm.get("value") if matching_alarm else None,
            "unit": None,
        }

    active_alarm_ids = {alarm["alarm_id"] for alarm in alarm_events}
    situation_type = situation.get("situation_type")
    return {
        "card_id": f"CC_{situation['situation_id']}",
        "situation_id": situation["situation_id"],
        "title": situation.get("title", situation_type),
        "severity": situation.get("severity", "warning"),
        "root_asset_id": situation["root_asset_id"],
        "root_asset_name": situation.get("root_asset_name"),
        "confidence": situation.get("confidence"),
        "created_at": situation.get("created_at")
        or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "first_signal": first_signal,
        "evidence_chain": evidence_chain,
        "why_it_matters": situation.get("confidence_reason", "Evidence-backed situation grouping."),
        "recommended_first_check": select_recommended_action(situation_type, action_envelope),
        "blocked_actions": find_blocked_actions(situation_type, active_alarm_ids, action_envelope),
        "time_to_consequence": projection,
        "raw_alarm_count": len(situation.get("grouped_alarm_ids", [])),
        "raw_alarm_ids": situation.get("grouped_alarm_ids", []),
        "operator_authority": OPERATOR_AUTHORITY,
    }