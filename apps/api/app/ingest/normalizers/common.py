"""Shared normalization result model and string helpers."""

from __future__ import annotations

import re

from pydantic import BaseModel, ConfigDict, Field

_TOKEN_RE = re.compile(r"[^A-Z0-9]+")
_SLUG_RE = re.compile(r"[^A-Z0-9]+")
_WHITESPACE_RE = re.compile(r"\s+")


class NormalizationResult(BaseModel):
    """Deterministic normalization output with confidence and audit notes."""

    model_config = ConfigDict(extra="forbid")

    value: str | None = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    notes: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


def is_blank(value: object) -> bool:
    """Return True when a value is None or whitespace-only."""
    if value is None:
        return True
    return not str(value).strip()


def normalize_token(value: str | None) -> str:
    """Normalize a token to uppercase underscore form."""
    if is_blank(value):
        return ""
    text = str(value).strip().upper()
    text = _TOKEN_RE.sub("_", text)
    return text.strip("_")


def normalize_label(value: str | None) -> str:
    """Normalize a human-readable label while preserving case."""
    if is_blank(value):
        return ""
    return _WHITESPACE_RE.sub(" ", str(value).strip())


def slug_upper_hyphen(value: str | None) -> str:
    """Normalize a label to an uppercase hyphenated slug."""
    if is_blank(value):
        return ""
    text = str(value).strip().upper()
    text = _SLUG_RE.sub("-", text)
    return text.strip("-")