"""Action library schema (Domain I) — Action Envelope preconditions & blockers."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

ActionState = Literal["available", "blocked", "degraded", "unsafe", "unknown"]


class Blocker(BaseModel):
    condition: str  # human + machine readable predicate ref
    reason: str


class ActionSpec(BaseModel):
    id: str
    label: str
    preconditions: list[str] = []
    hard_blockers: list[Blocker] = []
    risk_factors: list[str] = []
    roles_allowed: list[str] = []
    safe_state_for_fault: str | None = None


class ActionLibrary(BaseModel):
    actions: list[ActionSpec]
