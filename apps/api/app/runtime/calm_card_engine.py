"""Build deterministic Calm Cards from Situations."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

OPERATOR_AUTHORITY = (
    "PlantLens does not trip or control equipment. "
    "It provides evidence-backed decision support."
)

WHY_IT_MATTERS: dict[str, str] = {
    "MOTOR_MECHANICAL_OVERLOAD": (
        "The motor branch is pulling the DC bus down. The source is not the first suspect "
        "because current rose before bus voltage sagged."
    ),
    "PV_GENERATION_LOSS": (
        "PV generation dropped before the bus sagged, indicating an upstream source issue."
    ),
}


def build_why_it_matters(situation: dict[str, Any]) -> str:
    return WHY_IT_MATTERS.get(
        situation.get("situation_type", ""),
        "PlantLens grouped related alarms into one situation based on the approved causal graph.",
    )


def select_recommended_action(situation: dict[str, Any], action_envelope: dict[str, Any]) -> dict[str, Any]:
    situation_type = situation.get("situation_type")
    for action in action_envelope.get("actions", []):
        if situation_type in action.get("situation_ids", []):
            return {
                "action_id": action["id"],
                "label": action["label"],
                "risk_level": action.get("risk_level", "unknown"),
                "requires_isolation": bool(action.get("requires_isolation", False)),
            }
    return {
        "action_id": "REVIEW_RAW_ALARMS",
        "label": "Review raw alarms and evidence chain",
        "risk_level": "low",
        "requires_isolation": False,
    }


def find_blocked_actions(
    situation: dict[str, Any],
    active_alarm_ids: set[str],
    action_envelope: dict[str, Any],
) -> list[dict[str, Any]]:
    situation_type = situation.get("situation_type")
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


def build_calm_card(
    situation: dict[str, Any],
    alarm_events: list[dict[str, Any]],
    action_envelope: dict[str, Any],
    *,
    projection: dict[str, Any] | None = None,
) -> dict[str, Any]:
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
    card = {
        "card_id": f"CC_{situation['situation_id']}",
        "situation_id": situation["situation_id"],
        "title": situation.get("title", situation["situation_type"]),
        "severity": situation.get("severity", "warning"),
        "root_asset_id": situation["root_asset_id"],
        "root_asset_name": situation.get("root_asset_name"),
        "confidence": situation.get("confidence"),
        "created_at": situation.get("created_at")
        or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "first_signal": first_signal,
        "evidence_chain": evidence_chain,
        "why_it_matters": build_why_it_matters(situation),
        "recommended_first_check": select_recommended_action(situation, action_envelope),
        "blocked_actions": find_blocked_actions(situation, active_alarm_ids, action_envelope),
        "time_to_consequence": projection,
        "raw_alarm_count": len(situation.get("grouped_alarm_ids", [])),
        "raw_alarm_ids": situation.get("grouped_alarm_ids", []),
        "operator_authority": OPERATOR_AUTHORITY,
    }
    return card