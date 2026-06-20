"""Engineering unit normalization for offline ingestion."""

from __future__ import annotations

from app.ingest.normalizers.common import NormalizationResult, is_blank, normalize_token

_UNIT_ALIASES: dict[str, str] = {
    "V": "V",
    "VOLT": "V",
    "VOLTS": "V",
    "KV": "kV",
    "MV": "mV",
    "A": "A",
    "AMP": "A",
    "AMPS": "A",
    "AMPERE": "A",
    "AMPERES": "A",
    "MA": "mA",
    "W": "W",
    "WATT": "W",
    "WATTS": "W",
    "KW": "kW",
    "RPM": "rpm",
    "REV_MIN": "rpm",
    "MM_S": "mm/s",
    "MMPS": "mm/s",
    "MM_PER_S": "mm/s",
    "DEGC": "degC",
    "C": "degC",
    "CELSIUS": "degC",
    "DEGF": "degF",
    "FAHRENHEIT": "degF",
    "BOOL": "bool",
    "BOOLEAN": "bool",
    "STATE": "bool",
    "ON_OFF": "bool",
}

_SPECIAL_RAW_ALIASES: dict[str, str] = {
    "°c": "degC",
    "°f": "degF",
    "mm/s": "mm/s",
    "mm per s": "mm/s",
    "rev/min": "rpm",
}


def canonical_unit(value: str | None) -> str | None:
    """Return the canonical unit string without confidence metadata."""
    return normalize_unit(value).value


def normalize_unit(value: str | None) -> NormalizationResult:
    """Normalize an engineering unit string."""
    if is_blank(value):
        return NormalizationResult(
            value=None,
            confidence=0.0,
            warnings=["missing_unit"],
        )

    raw = str(value).strip()
    lowered = raw.casefold()
    if lowered in _SPECIAL_RAW_ALIASES:
        canonical = _SPECIAL_RAW_ALIASES[lowered]
        return NormalizationResult(
            value=canonical,
            confidence=1.0,
            notes=["matched_unit_alias"],
        )

    token = normalize_token(raw)
    if token in _UNIT_ALIASES:
        return NormalizationResult(
            value=_UNIT_ALIASES[token],
            confidence=1.0,
            notes=["matched_unit_alias"],
        )

    return NormalizationResult(
        value=raw,
        confidence=0.4,
        warnings=["unknown_unit"],
        notes=["fallback_raw_unit"],
    )