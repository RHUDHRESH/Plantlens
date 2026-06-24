"""Layer 5 — Evidence & Explanation (Domain H).

Three explicit lists: supporting / contradicting / missing. Explanation path is
the exact DAG walk + symptom matches that produced the Situation, printable and
timestamped so it survives as an audit artifact (cite signal keys + ts).
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .causal_grouping import Situation
from .fault_scoring import FaultScore


@dataclass
class Evidence:
    situation_id: str
    supporting: list[str] = field(default_factory=list)
    contradicting: list[str] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)
    explanation_path: list[str] = field(default_factory=list)


def build_evidence(sit: Situation, score: FaultScore | None) -> Evidence:
    """Assemble the three evidence lists + printable explanation path (scaffold)."""
    sup, con, miss = [], [], []
    if score:
        for m in score.matches:
            if m.match > 0:
                sup.append(m.signal)
            elif m.match < 0:
                con.append(m.signal)
            elif m.match == 0.0:
                miss.append(m.signal)
    return Evidence(sit.id, sup, con, miss,
                    [f"{sit.primary_fault} -> {', '.join(sup)}"])
