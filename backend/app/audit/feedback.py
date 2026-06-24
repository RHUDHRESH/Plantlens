"""Operator feedback router (Domain T) — mark-as -> DAG review queue.

Marks: REAL / NUISANCE / SENSOR_FAULT. Nuisance + sensor-fault feed the offline
miner queue so the known-world grows from operator ground truth, engineer-gated.
"""
from __future__ import annotations

from typing import Literal

Mark = Literal["real", "nuisance", "sensor_fault"]


def route_mark(situation_id: str, mark: Mark, actor: str) -> dict:
    """Route an operator mark to the DAG review queue (scaffold: returns a record)."""
    return {"situation_id": situation_id, "mark": mark, "actor": actor,
            "status": "queued_for_engineer_review"}
