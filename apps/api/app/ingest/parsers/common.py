"""Shared parser helpers for offline ingestion."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from app.ingest.mapping.similarity import simple_similarity, token_set
from typing import Literal

from app.ingest.normalizers.common import is_blank
from app.schemas.ingest.mapping import SuggestedMatch

SideKind = Literal["dc", "ac", "mechanical", "thermal", "unknown"]


def make_record_id() -> str:
    return f"nrm_{uuid4()}"


def first_field(fields: dict[str, str | None], aliases: tuple[str, ...]) -> str | None:
    """Return the first non-empty alias value from a raw row."""
    for alias in aliases:
        value = fields.get(alias)
        if not is_blank(value):
            return str(value).strip()
    return None


def average_confidence(*values: float) -> float:
    if not values:
        return 0.0
    return max(0.0, min(1.0, sum(values) / len(values)))


def normalize_side(value: str | None) -> SideKind:
    if is_blank(value):
        return "unknown"
    key = str(value).strip().casefold()
    mapping: dict[str, SideKind] = {
        "dc": "dc",
        "direct current": "dc",
        "ac": "ac",
        "alternating current": "ac",
        "mechanical": "mechanical",
        "mech": "mechanical",
        "thermal": "thermal",
        "temp": "thermal",
        "unknown": "unknown",
    }
    return mapping.get(key, "unknown")


def infer_signal_type(signal_label: str | None, unit: str | None) -> str:
    label = (signal_label or "").casefold()
    unit_value = (unit or "").casefold()

    if unit_value in {"v", "kv", "mv"} or "voltage" in label:
        return "voltage"
    if unit_value in {"a", "ma"} or "current" in label:
        return "current"
    if unit_value in {"w", "kw"} or "power" in label:
        return "power"
    if unit_value == "rpm" or "speed" in label:
        return "speed"
    if unit_value == "mm/s" or "vibration" in label or "vib" in label:
        return "vibration"
    if unit_value in {"degc", "degf"} or "temp" in label or "temperature" in label:
        return "temperature"
    if unit_value == "bool":
        return "state"
    return "unknown"


def close_tag_matches(
    raw_value: str,
    known_tags: dict[str, str] | None,
    *,
    threshold: float = 0.70,
    signal_label: str | None = None,
) -> list[SuggestedMatch]:
    matches: list[SuggestedMatch] = []
    for tag_id, label in (known_tags or {}).items():
        confidence = max(
            simple_similarity(raw_value, label),
            simple_similarity(raw_value, tag_id),
            simple_similarity(signal_label, label) if signal_label else 0.0,
        )
        signal_tokens = token_set(signal_label)
        label_tokens = token_set(label)
        if signal_tokens and signal_tokens <= label_tokens:
            confidence = max(confidence, 0.80)
        matches.append(
            SuggestedMatch(
                target_id=tag_id,
                label=label,
                confidence=confidence,
                evidence=[f"known_tag:{tag_id}"],
            )
        )
    matches = [match for match in matches if match.confidence >= threshold]
    matches.sort(key=lambda match: match.confidence, reverse=True)
    return matches


def build_fields_payload(
    *,
    raw_fields: dict[str, str | None],
    extra: dict[str, Any],
) -> dict[str, Any]:
    payload = {"raw_fields": raw_fields}
    payload.update(extra)
    return payload