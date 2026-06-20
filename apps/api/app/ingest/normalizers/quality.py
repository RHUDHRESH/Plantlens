"""Source quality normalization for offline ingestion."""

from __future__ import annotations

from app.ingest.normalizers.common import NormalizationResult, is_blank, normalize_token

_GOOD_ALIASES = frozenset({"GOOD", "OK", "VALID"})
_BAD_ALIASES = frozenset({"BAD", "INVALID", "FAULT", "STALE"})
_UNCERTAIN_ALIASES = frozenset({"UNCERTAIN", "QUESTIONABLE", "SUSPECT"})


def normalize_quality(value: str | None) -> NormalizationResult:
    """Normalize a source-quality label."""
    if is_blank(value):
        return NormalizationResult(
            value="unknown",
            confidence=0.0,
            warnings=["missing_quality"],
        )

    token = normalize_token(value)
    if token in _GOOD_ALIASES:
        return NormalizationResult(value="good", confidence=1.0, notes=["matched_quality_alias"])
    if token in _BAD_ALIASES:
        return NormalizationResult(value="bad", confidence=1.0, notes=["matched_quality_alias"])
    if token in _UNCERTAIN_ALIASES:
        return NormalizationResult(value="uncertain", confidence=1.0, notes=["matched_quality_alias"])

    return NormalizationResult(
        value="unknown",
        confidence=0.4,
        warnings=["unknown_quality"],
        notes=["fallback_unknown_quality"],
    )