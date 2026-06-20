"""Tag-id normalization for offline authored-knowledge ingestion."""

from __future__ import annotations

import re

from app.ingest.normalizers.asset import canonical_asset_id
from app.ingest.normalizers.common import NormalizationResult, is_blank, normalize_label, normalize_token

_TAG_ID_PATTERN = re.compile(r"^[A-Z0-9_]+$")

_PHYSICAL_DEMO_TAGS: dict[tuple[str, str, str], str] = {
    ("solar charger", "output voltage", "v1"): "CHG_SOLAR_OUT_V",
    ("solar charger", "output current", "i1"): "CHG_SOLAR_OUT_I",
    ("solar charger", "output power", "p1"): "CHG_SOLAR_OUT_P",
    ("mains charger", "output voltage", "v2"): "CHG_MAINS_OUT_V",
    ("mains charger", "output current", "i2"): "CHG_MAINS_OUT_I",
    ("mains charger", "output power", "p2"): "CHG_MAINS_OUT_P",
    ("24v lithium battery", "voltage", "v3"): "BAT_24V_V",
    ("24v lithium battery", "current", "i3"): "BAT_24V_I",
    ("24v lithium battery", "power", "p3"): "BAT_24V_P",
    ("inverter", "ac output voltage", "v4"): "INV_AC_OUT_V",
    ("inverter", "ac output current", "i4"): "INV_AC_OUT_I",
    ("inverter", "ac output power", "p4"): "INV_AC_OUT_P",
    ("vfd", "motor feed voltage", "v5"): "VFD_OUT_V",
    ("vfd", "motor feed current", "i5"): "VFD_OUT_I",
    ("vfd", "motor feed power", "p5"): "VFD_OUT_P",
    ("fhp 3phase ac motor", "speed", "n"): "MTR_FHP_SPEED",
    ("fhp 3phase ac motor", "vibration", "vib"): "MTR_FHP_VIB",
    ("fhp 3phase ac motor", "temperature", "temp"): "MTR_FHP_TEMP",
}

_ASSET_ALIASES_FOR_TAGS: dict[str, str] = {
    "solar mppt charger": "solar charger",
    "grid charger": "mains charger",
    "battery 24v": "24v lithium battery",
    "24v battery": "24v lithium battery",
    "3 phase motor": "fhp 3phase ac motor",
    "fhp motor": "fhp 3phase ac motor",
}


def is_valid_tag_id(value: str | None) -> bool:
    """Return True when value matches the canonical tag-id pattern."""
    if is_blank(value):
        return False
    return _TAG_ID_PATTERN.fullmatch(str(value)) is not None


def canonical_tag_id(
    *,
    asset_label: str | None,
    signal_label: str | None,
    tag_hint: str | None = None,
    unit: str | None = None,
    side: str | None = None,
) -> NormalizationResult:
    """Derive a canonical tag_id from authored signal-list fields."""
    del unit, side  # reserved for later parser/gate use

    if is_blank(asset_label) or is_blank(signal_label):
        return NormalizationResult(
            value=None,
            confidence=0.0,
            warnings=["missing_asset_or_signal"],
        )

    asset_key = _asset_match_key(asset_label)
    signal_key = normalize_label(signal_label).casefold()
    hint_key = "" if is_blank(tag_hint) else str(tag_hint).strip().casefold()

    lookup_key = (asset_key, signal_key, hint_key)
    if lookup_key in _PHYSICAL_DEMO_TAGS:
        return NormalizationResult(
            value=_PHYSICAL_DEMO_TAGS[lookup_key],
            confidence=1.0,
            notes=["matched_physical_demo_tag"],
        )

    for (demo_asset, demo_signal, _), tag_id in _PHYSICAL_DEMO_TAGS.items():
        if asset_key == demo_asset and signal_key == demo_signal and not hint_key:
            return NormalizationResult(
                value=tag_id,
                confidence=1.0,
                notes=["matched_physical_demo_tag"],
            )

    asset_id_result = canonical_asset_id(asset_label)
    asset_token = asset_id_result.value.replace("-", "_") if asset_id_result.value else ""
    signal_token = normalize_token(signal_label)
    if not asset_token or not signal_token:
        return NormalizationResult(
            value=None,
            confidence=0.0,
            warnings=["missing_asset_or_signal"],
        )

    fallback = f"{asset_token}_{signal_token}"
    return NormalizationResult(
        value=fallback,
        confidence=0.55,
        warnings=["fallback_tag_generated"],
        notes=["derived_from_asset_and_signal"],
    )


def _asset_match_key(asset_label: str | None) -> str:
    label = normalize_label(asset_label).casefold()
    return _ASSET_ALIASES_FOR_TAGS.get(label, label)