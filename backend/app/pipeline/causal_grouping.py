"""Layer 4 — Causal Grouping / Situation Engine (Domain G).

Backward+forward DAG traversal (networkx) over the approved causal graph;
temporal-window matching (effect fires within [lag_min, lag_max] of cause);
collapse N raw alarms -> 1 Situation; tag primary vs downstream by topological
position; grouping confidence from TEMPORAL FIT (how cleanly each effect landed
in its window), not edge-counting. Spurious-coincidence detection: alarms
co-occur in time but no causal path -> flagged for miner/queue.

Edges carry expected propagation-delay ranges so temporal fit is meaningful.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from ..schemas.graph import CausalGraph
from .fault_scoring import FaultScore


@dataclass
class Situation:
    id: str
    primary_fault: str
    confidence: float
    coverage: float
    grouping_confidence: float  # temporal fit
    member_signals: list[str] = field(default_factory=list)
    downstream: list[str] = field(default_factory=list)
    spurious: list[str] = field(default_factory=list)
    ts: float = 0.0


def group(scores: list[FaultScore], graph: CausalGraph, now: float) -> list[Situation]:
    """Collapse scored faults into Situations via DAG traversal (scaffold: one per top fault)."""
    return [Situation(f"sit-{f.fault_id}-{int(now)}", f.fault_id, f.confidence,
                      f.coverage, 1.0, [m.signal for m in f.matches], [], [], now)
            for f in scores if f.confidence > 0]
