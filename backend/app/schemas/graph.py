"""Causal DAG schema (Domain G) — the approved graph the live engine traverses."""
from __future__ import annotations

from pydantic import BaseModel


class CausalEdge(BaseModel):
    """An approved cause -> effect edge with a propagation-delay window."""
    cause: str  # signal key / instance id
    effect: str
    lag_min_s: float
    lag_max_s: float
    source_ref: str  # which matrix row / HAZOP line / miner proposal approved it
    approved_by: str  # engineer signature


class CausalGraph(BaseModel):
    edges: list[CausalEdge]

    def to_networkx(self):
        """Build a networkx.DiGraph for traversal (lazy import)."""
        import networkx as nx

        g = nx.DiGraph()
        for e in self.edges:
            g.add_edge(e.cause, e.effect, lag=(e.lag_min_s, e.lag_max_s),
                       ref=e.source_ref)
        return g
