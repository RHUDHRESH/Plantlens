"""Single source of truth for confidence buckets (used by DAG, situation and Calm Card)."""

from __future__ import annotations

HIGH_CONFIDENCE_THRESHOLD = 0.75
MEDIUM_CONFIDENCE_THRESHOLD = 0.45


def confidence_bucket(score: float) -> str:
    if score >= HIGH_CONFIDENCE_THRESHOLD:
        return "high"
    if score >= MEDIUM_CONFIDENCE_THRESHOLD:
        return "medium"
    return "low"


def calibrate(score: float, margin: float, min_margin: float) -> float:
    """Discount a root score when a competing explanation is nearly as good.

    ``margin`` is the gap to the best competitor that explains overlapping alarms. At zero
    margin the score is cut to 60 %, so a perfect-but-ambiguous root reads "medium", never
    "high". At or above ``min_margin`` the score is reported unchanged.
    """
    if min_margin <= 0:
        return score
    ratio = max(0.0, min(1.0, margin / min_margin))
    return score * (0.6 + 0.4 * ratio)
