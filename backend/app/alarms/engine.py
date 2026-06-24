"""Alarm engine — ISA-18.2 priority tiers + lifecycle (Domain J)."""
from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class Priority(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


@dataclass
class Alarm:
    id: str
    signal_key: str
    priority: Priority
    state: str  # unacked|acked|cleared|shelved|suppressed
    ts: float
    role_position: str = "operator"


def prioritize(band: str, criticality: str) -> Priority:
    """Map band + asset criticality to an ISA-18.2 priority tier (scaffold)."""
    if band == "critical" and criticality in ("high", "safety"):
        return Priority.HIGH
    if band == "critical":
        return Priority.MEDIUM
    return Priority.LOW
