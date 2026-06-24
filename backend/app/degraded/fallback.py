"""Degraded mode / resilience (Domain U).

If the engine is down, fall back to a clean ISA-18.2 alarm list (raw alarms,
no Situations) with a VISIBLE degraded-mode announcement banner. Degraded mode
must be obviously different visually so operators know they lost the cognition
layer. 3D fails -> 2D mimic; source loss -> last-good + quality flag.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class DegradedState:
    active: bool
    reason: str
    banner: str


def fallback(raw_alarms: list[dict]) -> dict:
    """Return a clean ISA-18.2 alarm list + visible banner (scaffold)."""
    return {
        "degraded": True,
        "banner": "DEGRADED MODE — cognition layer offline; showing raw ISA-18.2 alarm list",
        "alarms": raw_alarms,
    }
