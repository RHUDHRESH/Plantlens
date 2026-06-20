"""Timestamp normalization for offline ingestion."""

from __future__ import annotations

from datetime import UTC, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.ingest.normalizers.common import NormalizationResult, is_blank


def normalize_timestamp(value: str | None, *, plant_timezone: str = "UTC") -> NormalizationResult:
    """Normalize a timestamp string to UTC ISO-8601 with Z suffix."""
    if is_blank(value):
        return NormalizationResult(
            value=None,
            confidence=0.0,
            warnings=["missing_timestamp"],
        )

    raw = str(value).strip()
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return NormalizationResult(
            value=None,
            confidence=0.0,
            warnings=["invalid_timestamp"],
        )

    notes: list[str] = []
    if parsed.tzinfo is None:
        try:
            tz = ZoneInfo(plant_timezone)
        except ZoneInfoNotFoundError:
            return NormalizationResult(
                value=None,
                confidence=0.0,
                warnings=["invalid_timestamp"],
            )
        parsed = parsed.replace(tzinfo=tz)
        notes.append("assumed_plant_timezone")

    utc_value = parsed.astimezone(UTC).replace(microsecond=0)
    iso_value = utc_value.isoformat().replace("+00:00", "Z")
    return NormalizationResult(
        value=iso_value,
        confidence=1.0,
        notes=notes or ["parsed_timezone_aware_timestamp"],
    )