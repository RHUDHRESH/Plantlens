"""Asset label and asset-id normalization for offline ingestion."""

from __future__ import annotations

from app.ingest.normalizers.common import (
    NormalizationResult,
    is_blank,
    normalize_label,
    slug_upper_hyphen,
)

_PHYSICAL_DEMO_ASSET_IDS: dict[str, str] = {
    "solar charger": "CHG-SOLAR",
    "solar mppt charger": "CHG-SOLAR",
    "mains charger": "CHG-MAINS",
    "grid charger": "CHG-MAINS",
    "24v lithium battery": "BAT-24V",
    "battery 24v": "BAT-24V",
    "24v battery": "BAT-24V",
    "inverter": "INV-001",
    "vfd": "VFD-001",
    "fhp 3phase ac motor": "MTR-FHP",
    "3 phase motor": "MTR-FHP",
    "fhp motor": "MTR-FHP",
}

_ALIAS_NOTES: dict[str, str] = {
    "solar mppt charger": "alias:solar_mppt_charger",
    "grid charger": "alias:grid_charger",
    "battery 24v": "alias:battery_24v",
    "24v battery": "alias:24v_battery",
    "3 phase motor": "alias:3_phase_motor",
    "fhp motor": "alias:fhp_motor",
}


def normalize_asset_label(value: str | None) -> NormalizationResult:
    """Normalize a human-readable asset label."""
    if is_blank(value):
        return NormalizationResult(
            value=None,
            confidence=0.0,
            warnings=["missing_asset_label"],
        )
    label = normalize_label(value)
    return NormalizationResult(value=label, confidence=1.0, notes=["normalized_asset_label"])


def canonical_asset_id(asset_label: str | None) -> NormalizationResult:
    """Map an asset label to a canonical asset_id."""
    label_result = normalize_asset_label(asset_label)
    if label_result.value is None:
        return NormalizationResult(
            value=None,
            confidence=0.0,
            warnings=["missing_asset_label"],
        )

    key = label_result.value.casefold()
    if key in _PHYSICAL_DEMO_ASSET_IDS:
        notes = ["matched_physical_demo_asset"]
        alias_note = _ALIAS_NOTES.get(key)
        if alias_note:
            notes.append(alias_note)
        return NormalizationResult(
            value=_PHYSICAL_DEMO_ASSET_IDS[key],
            confidence=1.0,
            notes=notes,
        )

    fallback = slug_upper_hyphen(label_result.value)
    return NormalizationResult(
        value=fallback,
        confidence=0.55,
        warnings=["unknown_asset_label"],
        notes=["fallback_asset_slug"],
    )