"""Advisory time-to-consequence projection — never on trip path."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

EMA_ALPHA = 0.35
MIN_SAMPLES = 3
MAX_BAND_RATIO = 0.25


@dataclass
class Projection:
    target_tag: str
    target_label: str
    seconds_low: float | None
    seconds_high: float | None
    state: str


@dataclass
class _TagHistory:
    samples: list[tuple[datetime, float]] = field(default_factory=list)
    ema_value: float | None = None
    ema_slope: float | None = None
    last_ts: datetime | None = None


_history: dict[str, _TagHistory] = {}


def reset_projection_history() -> None:
    _history.clear()


def _unknown(tag_id: str, target_label: str) -> dict[str, Any]:
    return {
        "target_tag": tag_id,
        "target_label": target_label,
        "state": "unknown",
        "seconds_low": None,
        "seconds_high": None,
    }


def _stable(tag_id: str, target_label: str) -> dict[str, Any]:
    return {
        "target_tag": tag_id,
        "target_label": target_label,
        "state": "stable",
        "seconds_low": None,
        "seconds_high": None,
    }


def update_projection(
    tag_id: str,
    value: float | None,
    ts: datetime,
    *,
    threshold: float,
    target_label: str,
    window: int = 8,
) -> dict[str, Any] | None:
    if value is None:
        return _unknown(tag_id, target_label)

    history = _history.setdefault(tag_id, _TagHistory())
    numeric = float(value)

    if history.last_ts is not None and ts <= history.last_ts:
        return _unknown(tag_id, target_label)

    history.last_ts = ts
    history.samples.append((ts, numeric))
    history.samples = history.samples[-window:]

    if history.ema_value is None:
        history.ema_value = numeric
    else:
        history.ema_value = EMA_ALPHA * numeric + (1.0 - EMA_ALPHA) * history.ema_value

    if len(history.samples) < 2:
        return _unknown(tag_id, target_label)

    prev_ts, prev_val = history.samples[-2]
    dt = (ts - prev_ts).total_seconds()
    if dt <= 0:
        return _unknown(tag_id, target_label)

    instant_slope = (numeric - prev_val) / dt
    if history.ema_slope is None:
        history.ema_slope = instant_slope
    else:
        history.ema_slope = EMA_ALPHA * instant_slope + (1.0 - EMA_ALPHA) * history.ema_slope

    if len(history.samples) < MIN_SAMPLES:
        return _unknown(tag_id, target_label)

    rate = history.ema_slope or 0.0
    smoothed = history.ema_value if history.ema_value is not None else numeric

    if abs(rate) < 1e-9:
        return _stable(tag_id, target_label)

    seconds = (threshold - smoothed) / rate
    if seconds <= 0:
        return _stable(tag_id, target_label)

    band = max(5.0, seconds * MAX_BAND_RATIO)
    return {
        "target_tag": tag_id,
        "target_label": target_label,
        "state": "counting",
        "seconds_low": max(0.0, seconds - band),
        "seconds_high": seconds + band,
    }