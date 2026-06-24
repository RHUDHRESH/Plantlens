"""Edge-candidate proposals -> staging area; NEVER touches live graph (Domain S).

This is the ML-confinement seam: miners write here, engineer approves, only then
does an edge enter models/graph.json with an `approved_by` signature.
"""
from __future__ import annotations

from pathlib import Path

STAGING = Path(__file__).resolve().parents[1] / "models" / "staging"


def propose(edge: dict) -> dict:
    """Write a candidate edge to staging (never to graph.json)."""
    STAGING.mkdir(parents=True, exist_ok=True)
    return {"staged": True, "edge": edge, "status": "awaiting_engineer_approval"}
