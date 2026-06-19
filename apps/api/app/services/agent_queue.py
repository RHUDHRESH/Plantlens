"""Draft-only agent approval queue (rule R5)."""

from __future__ import annotations

import uuid
from copy import deepcopy
from datetime import UTC, datetime
from threading import Lock
from typing import Any, Literal

DraftStatus = Literal["pending", "approved", "rejected"]


class AgentDraftQueue:
    def __init__(self) -> None:
        self._drafts: dict[str, dict[str, Any]] = {}
        self._approved_artifacts: dict[str, dict[str, Any]] = {}
        self._lock = Lock()

    def submit(self, *, draft_type: str, payload: dict[str, Any], proposed_by: str) -> dict[str, Any]:
        draft_id = f"DRF_{uuid.uuid4().hex[:10].upper()}"
        now = datetime.now(UTC).isoformat().replace("+00:00", "Z")
        draft = {
            "draft_id": draft_id,
            "draft_type": draft_type,
            "status": "pending",
            "proposed_by": proposed_by,
            "created_at": now,
            "payload": deepcopy(payload),
        }
        with self._lock:
            self._drafts[draft_id] = draft
        return deepcopy(draft)

    def get(self, draft_id: str) -> dict[str, Any] | None:
        with self._lock:
            draft = self._drafts.get(draft_id)
            return deepcopy(draft) if draft else None

    def list_pending(self) -> list[dict[str, Any]]:
        with self._lock:
            return [
                deepcopy(draft)
                for draft in self._drafts.values()
                if draft.get("status") == "pending"
            ]

    def resolve(
        self,
        draft_id: str,
        *,
        status: DraftStatus,
        resolved_by: str,
    ) -> dict[str, Any]:
        with self._lock:
            draft = self._drafts.get(draft_id)
            if draft is None:
                msg = f"draft {draft_id} not found"
                raise KeyError(msg)
            if draft["status"] != "pending":
                msg = f"draft {draft_id} already {draft['status']}"
                raise ValueError(msg)
            draft["status"] = status
            draft["resolved_by"] = resolved_by
            draft["resolved_at"] = datetime.now(UTC).isoformat().replace("+00:00", "Z")
            if status == "approved":
                self._approved_artifacts[draft_id] = deepcopy(draft)
            return deepcopy(draft)

    def list_approved(self) -> list[dict[str, Any]]:
        with self._lock:
            return [deepcopy(draft) for draft in self._approved_artifacts.values()]

    def get_approved(self, draft_id: str) -> dict[str, Any] | None:
        with self._lock:
            draft = self._approved_artifacts.get(draft_id)
            return deepcopy(draft) if draft else None

    def clear(self) -> None:
        with self._lock:
            self._drafts.clear()
            self._approved_artifacts.clear()


agent_draft_queue = AgentDraftQueue()


def reset_agent_queue_for_tests() -> None:
    agent_draft_queue.clear()