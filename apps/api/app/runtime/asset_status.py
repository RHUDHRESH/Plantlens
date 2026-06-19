"""Derive per-asset status for maps and HMI."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any



STATUS_PRECEDENCE = {
    "normal": 0,
    "warning": 1,
    "critical": 2,
    "sensor_bad": 3,
    "offline": 4,
    "unknown": 0,
}


def _escalate(current: str, new_status: str) -> str:
    if STATUS_PRECEDENCE.get(new_status, 0) >= STATUS_PRECEDENCE.get(current, 0):
        return new_status
    return current


def derive_asset_status(
    asset_index: dict[str, dict[str, Any]],
    active_alarms: dict[str, dict[str, Any]],
    active_situations: dict[str, dict[str, Any]],
    tags: dict[str, Any],
    now: datetime,
) -> dict[str, str]:
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    statuses = {asset_id: "normal" for asset_id in asset_index}

    tag_by_asset: dict[str, list[Any]] = {}
    for tag_id, frame in tags.items():
        tag_by_asset.setdefault(frame.asset_id, []).append(frame)

    for asset_id, asset_tags in tag_by_asset.items():
        if asset_id not in statuses:
            continue
        if any(frame.quality in {"STALE", "MISSING", "BAD"} for frame in asset_tags):
            statuses[asset_id] = _escalate(statuses[asset_id], "sensor_bad")
        elif not asset_tags:
            statuses[asset_id] = _escalate(statuses[asset_id], "offline")

    for alarm in active_alarms.values():
        asset_id = alarm.get("asset_id")
        if not asset_id or asset_id not in statuses:
            continue
        if alarm.get("severity") == "critical":
            statuses[asset_id] = _escalate(statuses[asset_id], "critical")
        elif alarm.get("severity") == "warning":
            statuses[asset_id] = _escalate(statuses[asset_id], "warning")

    for situation in active_situations.values():
        root = situation.get("root_asset_id")
        if root and root in statuses:
            statuses[root] = _escalate(statuses[root], "critical")
        for asset_id in situation.get("affected_asset_ids", []) or []:
            if asset_id in statuses:
                statuses[asset_id] = _escalate(statuses[asset_id], "warning")

    return statuses