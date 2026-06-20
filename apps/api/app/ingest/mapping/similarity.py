"""Deterministic string similarity helpers for offline ingestion mapping."""

from __future__ import annotations

import re

_MATCH_RE = re.compile(r"[^a-z0-9]+")
_WHITESPACE_RE = re.compile(r"\s+")


def normalize_for_match(value: str | None) -> str:
    """Normalize a string for deterministic similarity comparison."""
    if value is None:
        return ""
    text = value.casefold().strip()
    text = _MATCH_RE.sub(" ", text)
    return _WHITESPACE_RE.sub(" ", text).strip()


def token_set(value: str | None) -> set[str]:
    """Return normalized token set for a value."""
    normalized = normalize_for_match(value)
    if not normalized:
        return set()
    return set(normalized.split())


def jaccard_similarity(a: str | None, b: str | None) -> float:
    """Compute Jaccard similarity between token sets."""
    left = token_set(a)
    right = token_set(b)
    if not left and not right:
        return 1.0
    if not left or not right:
        return 0.0
    intersection = left & right
    union = left | right
    return len(intersection) / len(union)


def simple_similarity(a: str | None, b: str | None) -> float:
    """Combine exact, substring, and token overlap similarity."""
    left = normalize_for_match(a)
    right = normalize_for_match(b)
    if not left and not right:
        return 1.0
    if not left or not right:
        return 0.0
    if left == right:
        return 1.0

    scores = [jaccard_similarity(a, b)]
    if left in right or right in left:
        shorter = min(len(left), len(right))
        longer = max(len(left), len(right))
        scores.append(shorter / longer)
    return max(min(score, 1.0) for score in scores)