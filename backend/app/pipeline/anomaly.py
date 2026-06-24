"""Layer 3b — Unknown / Anomaly Detection (Domain F). Open-world.

Multivariate residual (observed - model-predicted) with a novelty trigger on
Mahalanobis-distance threshold. Surfaces an Unclassified Situation when the
residual is high but NO known fault scores above the floor. Never fabricates a
diagnosis: "abnormal pattern, no known fault matches, here is the raw evidence."

Law #3: the runtime only EVALUATES a frozen statistical residual/threshold;
any learned covariance is authored offline in miners/ and approved. No .fit() live.
"""
from __future__ import annotations

from dataclasses import dataclass

from .fault_scoring import FaultScore
from .state_estimation import EstimatedState


@dataclass
class AnomalyReport:
    is_anomalous: bool
    mahalanobis: float
    top_known_confidence: float
    reason: str


def detect(scores: list[FaultScore], states: list[EstimatedState],
           confidence_floor: float = 0.4) -> AnomalyReport:
    """Novelty trigger: top known < floor AND real deviation (scaffold: stub)."""
    top = max((s.confidence for s in scores), default=0.0)
    anomalous = top < confidence_floor  # real-deviation check wired later
    return AnomalyReport(anomalous, 0.0, top,
                         "top known fault below floor; candidate unclassified situation")
