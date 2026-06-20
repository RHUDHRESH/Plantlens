"""Alarm priority normalization for offline ingestion."""

from __future__ import annotations

from app.ingest.normalizers.common import NormalizationResult, is_blank, normalize_token

_TEXT_PRIORITIES: dict[str, str] = {
    "CRITICAL": "critical",
    "HIGH": "high",
    "MEDIUM": "medium",
    "LOW": "low",
    "INFO": "info",
    "INFORMATIONAL": "info",
}


def normalize_priority(value: str | int | None) -> NormalizationResult:
    """Normalize alarm priority from text or numeric severity."""
    if value is None or (isinstance(value, str) and is_blank(value)):
        return NormalizationResult(
            value=None,
            confidence=0.0,
            warnings=["missing_priority"],
        )

    if isinstance(value, int) or (isinstance(value, str) and value.strip().isdigit()):
        numeric = int(value)
        if numeric >= 800:
            canonical = "critical"
        elif numeric >= 600:
            canonical = "high"
        elif numeric >= 300:
            canonical = "medium"
        elif numeric >= 100:
            canonical = "low"
        else:
            canonical = "info"
        return NormalizationResult(
            value=canonical,
            confidence=1.0,
            notes=["mapped_numeric_priority"],
        )

    token = normalize_token(str(value))
    if token in _TEXT_PRIORITIES:
        return NormalizationResult(
            value=_TEXT_PRIORITIES[token],
            confidence=1.0,
            notes=["matched_text_priority"],
        )

    return NormalizationResult(
        value=None,
        confidence=0.0,
        warnings=["unknown_priority"],
    )