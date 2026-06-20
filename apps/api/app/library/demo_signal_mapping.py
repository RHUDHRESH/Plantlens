"""Migration scaffolding: map legacy HMI demo tags to library signal keys."""

from __future__ import annotations

from typing import Any

LEGACY_TAG_TO_SIGNAL_KEY: dict[str, str] = {
    "PSU_VOLTAGE": "dc_power_supply_1.supply_voltage",
    "MTR_CURRENT": "dc_motor_12v_1.motor_current",
    "MTR_RPM": "dc_motor_12v_1.motor_rpm",
    "MTR_VIBRATION": "dc_motor_12v_1.motor_vibration",
    "MTR_TEMP": "dc_motor_12v_1.motor_temperature",
    "FAN_RPM": "bldc_fan_1.fan_rpm",
    "BLW_AIRFLOW": "industrial_blower_1.blower_airflow",
}


def _infer_relation(signal: dict[str, Any]) -> str:
    if signal.get("missing"):
        return "missing"
    if signal.get("stale") or signal.get("timestamp_status") == "stale":
        return "stale"
    value = signal.get("value")
    if value is None:
        return "missing"
    expected_min = signal.get("expected_min")
    expected_max = signal.get("expected_max")
    if expected_max is not None and value > expected_max:
        return "high"
    if expected_min is not None and value < expected_min:
        return "low"
    return "nominal"


def map_legacy_tag(tag: str) -> str | None:
    return LEGACY_TAG_TO_SIGNAL_KEY.get(tag)


def map_hmi_fixture_to_observed_signals(fixture: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Convert legacy HMI fixture signals to library observed_signals + data_quality."""
    observed: dict[str, Any] = {}
    quality: dict[str, Any] = {}

    for signal in fixture.get("signals") or []:
        tag = signal.get("signal_id", "")
        signal_key = map_legacy_tag(tag)
        if signal_key is None:
            continue
        relation = _infer_relation(signal)

        timestamp_status = "fresh"
        quality_raw = (signal.get("quality") or "GOOD").upper()
        if signal.get("stale") or signal.get("timestamp_status") == "stale" or quality_raw == "STALE":
            timestamp_status = "stale"
            relation = "stale"
        if signal.get("missing"):
            timestamp_status = "missing"
            relation = "missing"

        observed[signal_key] = {
            "value": signal.get("value"),
            "relation": relation,
            "quality": (signal.get("quality") or "good").lower(),
            "timestamp_status": timestamp_status,
        }
        quality[signal_key] = {
            "quality": (signal.get("quality") or "good").lower(),
            "timestamp_status": timestamp_status,
        }

    return observed, quality


def map_observed_signals_dict(
    observed_signals: dict[str, Any],
) -> dict[str, Any]:
    """Map a dict keyed by legacy tags to library signal keys."""
    mapped: dict[str, Any] = {}
    for key, value in observed_signals.items():
        target = map_legacy_tag(key) or key
        mapped[target] = value
    return mapped