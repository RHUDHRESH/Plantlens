"""Offline ingestion tabular adapter base types and utilities."""

from __future__ import annotations

import re
from collections.abc import Sequence
from typing import Any, Protocol, runtime_checkable
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.ingest.artifact import RawArtifact
from app.schemas.ingest.record import RawRecord


class AdapterError(Exception):
    """Base error for offline ingestion adapters."""


class UnsupportedArtifactError(AdapterError):
    """Artifact type or extension is not supported by the adapter."""


class AdapterParseError(AdapterError):
    """Tabular content could not be parsed."""


class AdapterResult(BaseModel):
    """Adapter output: raw records plus non-fatal warnings and extraction metadata."""

    model_config = ConfigDict(extra="forbid")

    artifact: RawArtifact
    records: list[RawRecord]
    warnings: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


@runtime_checkable
class TabularAdapter(Protocol):
    """Extracts tabular rows from raw artifact bytes."""

    def extract_records(self, *, artifact: RawArtifact, content: bytes) -> AdapterResult: ...


_HEADER_CLEAN_RE = re.compile(r"[_]+")


def clean_header(value: str) -> str:
    """Normalize a header label for stable column keys."""
    normalized = value.strip().lower()
    for separator in (" ", "-", "/"):
        normalized = normalized.replace(separator, "_")
    normalized = _HEADER_CLEAN_RE.sub("_", normalized)
    return normalized.strip("_")


def clean_cell(value: object) -> str | None:
    """Normalize a cell value to a stripped string or None."""
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def make_raw_id() -> str:
    """Generate a new raw record identifier."""
    return f"raw_{uuid4()}"


def reject_duplicate_headers(cleaned_headers: list[str], *, context: str) -> None:
    """Raise when cleaned headers collide within one table."""
    if not cleaned_headers:
        raise AdapterParseError(f"{context}: header row is empty")
    if len(set(cleaned_headers)) != len(cleaned_headers):
        raise AdapterParseError(f"{context}: duplicate headers after cleaning")


def row_is_empty(values: Sequence[object]) -> bool:
    """Return True when every cell is blank after cleaning."""
    return all(clean_cell(value) is None for value in values)