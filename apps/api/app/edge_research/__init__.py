"""Experimental edge inference components.

This package is shadow-mode research code. It is intentionally not imported by the
live PlantLens runtime and has no hardware-write surface.
"""

from app.edge_research.factorial_shadow import (
    ApprovedFaultEdge,
    EdgeEpoch,
    FactorialShadowEngine,
    FaultEvidenceSpec,
    ShadowDecision,
)
from app.edge_research.compact_ensemble import (
    CompactFaultEnsemble,
    EnsembleDecision,
    EnsembleMember,
    FaultEstimate,
)

__all__ = [
    "EdgeEpoch",
    "ApprovedFaultEdge",
    "FactorialShadowEngine",
    "FaultEvidenceSpec",
    "ShadowDecision",
    "CompactFaultEnsemble",
    "EnsembleDecision",
    "EnsembleMember",
    "FaultEstimate",
]
