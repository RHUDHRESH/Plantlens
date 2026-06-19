"""Time-to-consequence projection tests."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.runtime.projection import reset_projection_history, update_projection

TS = datetime(2026, 6, 18, 12, 0, 0, tzinfo=timezone.utc)


def setup_function() -> None:
    reset_projection_history()


def _feed(tag_id: str, values: list[float], *, threshold: float = 75.0) -> dict:
    result = None
    for index, value in enumerate(values):
        result = update_projection(
            tag_id,
            value,
            TS + timedelta(seconds=index),
            threshold=threshold,
            target_label="Motor temperature limit",
        )
    return result or {}


def test_missing_value_unknown():
    result = update_projection("MOTOR_301_TEMP", None, TS, threshold=75.0, target_label="Temp")
    assert result["state"] == "unknown"


def test_stable_trend():
    result = _feed("stable", [48.0, 48.0, 48.0, 48.0, 48.0, 48.0])
    assert result["state"] == "stable"
    assert result["seconds_low"] is None


def test_rising_trend_counting_with_band():
    result = _feed("rising", [60.0, 63.0, 66.0, 69.0, 72.0, 74.0, 76.0])
    assert result["state"] == "counting"
    assert result["seconds_low"] is not None
    assert result["seconds_high"] is not None
    assert result["seconds_low"] < result["seconds_high"]


def test_falling_trend_stable():
    result = _feed("falling", [74.0, 73.0, 72.0, 71.0, 70.0, 69.0, 68.0, 67.0])
    assert result["state"] == "stable"


def test_noisy_values_still_advisory():
    result = _feed("noisy", [70.0, 69.5, 70.2, 69.0, 68.5, 68.0, 67.5])
    assert result["state"] in {"counting", "stable", "unknown"}


def test_non_monotonic_timestamps_fail_closed():
    reset_projection_history()
    update_projection("mono", 70.0, TS, threshold=75.0, target_label="Temp")
    update_projection("mono", 69.0, TS + timedelta(seconds=1), threshold=75.0, target_label="Temp")
    result = update_projection("mono", 68.0, TS, threshold=75.0, target_label="Temp")
    assert result["state"] == "unknown"


def test_too_few_samples_unknown():
    reset_projection_history()
    update_projection("few", 70.0, TS, threshold=75.0, target_label="Temp")
    result = update_projection("few", 69.0, TS + timedelta(seconds=1), threshold=75.0, target_label="Temp")
    assert result["state"] == "unknown"