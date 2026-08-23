"""Lightweight situation-create audit buffer for runtime_tick.

Runtime tick is synchronous and has no DB session. Situation creates are
recorded here; API/async layers can drain into AuditChainService when needed.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Callable

SituationAuditHook = Callable[[dict[str, Any]], None]


class SituationAuditBuffer:
    """In-process append-only log of situation_id create/clear events."""

    def __init__(self) -> None:
        self._entries: list[dict[str, Any]] = []
        self._hooks: list[SituationAuditHook] = []

    def clear(self) -> None:
        self._entries.clear()

    def add_hook(self, hook: SituationAuditHook) -> None:
        self._hooks.append(hook)

    def reset_hooks(self) -> None:
        self._hooks.clear()

    def record(
        self,
        *,
        action: str,
        situation_id: str,
        plant_id: str | None = None,
        after: dict[str, Any] | None = None,
        before: dict[str, Any] | None = None,
        ts: datetime | None = None,
    ) -> dict[str, Any]:
        when = ts or datetime.now(timezone.utc)
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        entry = {
            "audit_id": str(uuid.uuid4()),
            "ts": when.isoformat().replace("+00:00", "Z"),
            "actor_type": "system",
            "actor_id": "runtime_tick",
            "action": action,
            "entity_type": "situation",
            "entity_id": situation_id,
            "plant_id": plant_id,
            "before": before,
            "after": after or {},
        }
        self._entries.append(entry)
        for hook in list(self._hooks):
            hook(entry)
        return entry

    def entries(self) -> list[dict[str, Any]]:
        return list(self._entries)

    def entries_for(self, situation_id: str) -> list[dict[str, Any]]:
        return [e for e in self._entries if e.get("entity_id") == situation_id]


situation_audit_buffer = SituationAuditBuffer()


def reset_situation_audit_for_tests() -> None:
    situation_audit_buffer.clear()
    situation_audit_buffer.reset_hooks()
