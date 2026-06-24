"""Layer 6 — Action Envelope (Domain I).

Per-cycle evaluation of each action against live plant state. Five states:
  AVAILABLE / BLOCKED / DEGRADED / UNSAFE / UNKNOWN — each with a mandatory reason.
PlantLens NEVER executes the action (read-only law) — it computes whether an
action WOULD be safe/available and tells the engineer; the DCS executes.
"""
from __future__ import annotations

from dataclasses import dataclass

from ..schemas.actions import ActionSpec
from .causal_grouping import Situation


@dataclass
class ActionState:
    action_id: str
    state: str  # available|blocked|degraded|unsafe|unknown
    reason: str
    risk_factors: list[str]


def evaluate(action: ActionSpec, sit: Situation | None) -> ActionState:
    """Evaluate one action against the current situation (scaffold: AVAILABLE if no blocker)."""
    if action.hard_blockers:
        return ActionState(action.id, "blocked", action.hard_blockers[0].reason, action.risk_factors)
    return ActionState(action.id, "available", "no blockers", action.risk_factors)
