"""Incident room service — evidence-first command screen."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from app.incidents.incident_checklist import build_checklist_for_situation
from app.incidents.incident_store import incident_store
from app.incidents.incident_timeline import make_timeline_item
from app.runtime.runtime_state import RuntimeState, runtime_state


def _asset_name(asset_id: str, asset_index: dict[str, Any] | None = None) -> str:
    if asset_index and asset_id in asset_index:
        return str(asset_index[asset_id].get("name", asset_id))
    return asset_id


def build_live_state(
    evidence_bundle: dict[str, Any],
    *,
    state: RuntimeState | None = None,
) -> dict[str, Any]:
    live = state or runtime_state
    situation = evidence_bundle.get("situation", {})
    root = situation.get("root_asset_id", "")
    bundle_alarm_ids = {
        alarm.get("alarm_id")
        for alarm in evidence_bundle.get("raw_alarms", [])
        if alarm.get("alarm_id")
    }
    related = [
        alarm
        for alarm in live.active_alarms.values()
        if alarm.get("asset_id") == root or alarm.get("alarm_id") in bundle_alarm_ids
    ]
    tag_summary: list[dict[str, Any]] = []
    for tag_id, frame in live.tags.items():
        if frame.asset_id == root:
            tag_summary.append(
                {
                    "tag_id": tag_id,
                    "value": frame.value,
                    "unit": frame.unit,
                    "quality": frame.quality,
                }
            )
    return {
        "still_active": len(related) > 0,
        "active_alarm_count": len(related),
        "latest_value_summary": tag_summary,
    }


def create_incident_from_calm_card(
    card: dict[str, Any],
    situation: dict[str, Any],
    *,
    actor: str,
    raw_alarms: list[dict[str, Any]] | None = None,
    traversed_edges: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    now = datetime.now(UTC)
    incident_id = f"INC_{now.strftime('%Y%m%d')}_{uuid.uuid4().hex[:6].upper()}"
    root_asset_id = situation.get("root_asset_id") or card.get("root_asset_id", "")
    evidence_bundle = {
        "situation": situation,
        "raw_alarms": raw_alarms or [],
        "traversed_edges": traversed_edges or situation.get("causal_path", []),
    }
    incident = {
        "incident_id": incident_id,
        "title": card.get("title", "Incident"),
        "status": "open",
        "severity": card.get("severity", situation.get("severity", "warning")),
        "created_at": now.isoformat().replace("+00:00", "Z"),
        "updated_at": now.isoformat().replace("+00:00", "Z"),
        "root_asset": {
            "asset_id": root_asset_id,
            "name": card.get("root_asset_name") or root_asset_id,
            "status": "critical" if card.get("severity") == "critical" else "warning",
        },
        "calm_card": card,
        "evidence_bundle": evidence_bundle,
        "checklist": build_checklist_for_situation(situation.get("situation_type")),
        "timeline": [
            make_timeline_item(
                "incident_created",
                actor,
                "Incident created from Calm Card.",
                timestamp=now,
            )
        ],
        "resolution": None,
    }
    incident["live_state"] = build_live_state(evidence_bundle)
    return incident_store.save(incident)


def build_incident_room(incident_id: str, *, state: RuntimeState | None = None) -> dict[str, Any] | None:
    stored = incident_store.get(incident_id)
    if stored is None:
        return None
    now = datetime.now(UTC)
    stored["live_state"] = build_live_state(stored.get("evidence_bundle", {}), state=state)
    stored["updated_at"] = now.isoformat().replace("+00:00", "Z")
    return stored


def add_comment(incident_id: str, *, actor: str, message: str) -> dict[str, Any]:
    item = make_timeline_item("comment", actor, message)
    return incident_store.append_timeline(incident_id, item)


def update_status(incident_id: str, *, actor: str, status: str) -> dict[str, Any]:
    incident = incident_store.get(incident_id)
    if incident is None:
        msg = f"incident {incident_id} not found"
        raise KeyError(msg)
    item = make_timeline_item("status_changed", actor, f"Status changed to {status}.")
    incident_store.append_timeline(incident_id, item)
    return incident_store.update(incident_id, status=status)


def complete_checklist_item(
    incident_id: str,
    *,
    item_id: str,
    actor: str,
    status: str = "done",
) -> dict[str, Any]:
    incident = incident_store.get(incident_id)
    if incident is None:
        msg = f"incident {incident_id} not found"
        raise KeyError(msg)
    checklist = incident.get("checklist", [])
    updated: list[dict[str, Any]] = []
    found = False
    now = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    for item in checklist:
        if item.get("id") == item_id:
            found = True
            updated.append(
                {
                    **item,
                    "status": status,
                    "completed_by": actor if status == "done" else None,
                    "completed_at": now if status == "done" else None,
                }
            )
        else:
            updated.append(item)
    if not found:
        msg = f"checklist item {item_id} not found"
        raise KeyError(msg)
    item = make_timeline_item(
        "checklist_updated",
        actor,
        f"Checklist item '{item_id}' marked {status}.",
    )
    incident_store.append_timeline(incident_id, item)
    return incident_store.update(incident_id, checklist=updated)