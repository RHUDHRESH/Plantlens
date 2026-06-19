"""Append-only incident timeline items."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any, Literal

TimelineType = Literal[
    "incident_created",
    "status_changed",
    "comment",
    "checklist_updated",
    "resolution_added",
    "system_update",
]


def make_timeline_item(
    item_type: TimelineType,
    actor: str,
    message: str,
    *,
    timestamp: datetime | None = None,
) -> dict[str, Any]:
    ts = timestamp or datetime.now(UTC)
    return {
        "id": f"tl_{uuid.uuid4().hex[:12]}",
        "type": item_type,
        "timestamp": ts.isoformat().replace("+00:00", "Z"),
        "actor": actor,
        "message": message,
    }