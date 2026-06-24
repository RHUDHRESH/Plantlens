"""Relevance scoring (Domain O).

relevance = priority * role_match * spatial_proximity * work_order_boost
            * process_safety_time_urgency

PST urgency closes the loop with State Estimation's time-to-threshold (Domain D).
Per-operator ranking -> personalized feed (streaming-app style), not a global list.
"""
from __future__ import annotations

from dataclasses import dataclass

from .causal_grouping import Situation


@dataclass
class RelevanceScore:
    situation_id: str
    role: str
    score: float


def score_relevance(sit: Situation, role: str, weights: dict[str, float],
                    spatial_proximity: float = 0.5, work_order_boost: float = 0.3,
                    pst_urgency: float = 0.5) -> RelevanceScore:
    """Combine the five factors per the role's weights (scaffold: priority = confidence)."""
    priority = sit.confidence
    role_match = weights.get("role_match", 1.0)
    r = (priority * role_match * spatial_proximity * work_order_boost * pst_urgency)
    return RelevanceScore(sit.id, role, r)
