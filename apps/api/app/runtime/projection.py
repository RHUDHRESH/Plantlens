"""Advisory time-to-consequence projection — never on trip path."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

EMA_ALPHA = 0.35
MIN_SAMPLES = 3
MAX_BAND_RATIO = 0.25

USABLE_QUALITIES = frozenset({"GOOD"})


@dataclass
class _TagHistory:
    samples: list[tuple[datetime, float]] = field(default_factory=list)
    ema_value: float | None = None
    ema_slope: float | None = None
    last_ts: datetime | None = None


_history: dict[str, _TagHistory] = {}


def reset_projection_history() -> None:
    _history.clear()


def _result(
    tag_id: str,
    target_label: str,
    state: str,
    *,
    seconds_low: float | None = None,
    seconds_mid: float | None = None,
    seconds_high: float | None = None,
    confidence: float = 0.0,
    reason: str = "",
) -> dict[str, Any]:
    return {
        "target_tag": tag_id,
        "target_label": target_label,
        "state": state,
        "seconds_low": seconds_low,
        "seconds_mid": seconds_mid,
        "seconds_high": seconds_high,
        "confidence": confidence,
        "reason": reason,
    }


def update_projection(
    tag_id: str,
    value: float | None,
    ts: datetime,
    *,
    threshold: float,
    target_label: str,
    window: int = 8,
    quality: str = "GOOD",
) -> dict[str, Any] | None:
    if value is None:
        return _result(tag_id, target_label, "unknown", reason="No value")

    if quality not in USABLE_QUALITIES:
        return _result(tag_id, target_label, "unknown", reason=f"Ignored {quality} sample")

    history = _history.setdefault(tag_id, _TagHistory())
    numeric = float(value)

    if history.last_ts is not None and ts <= history.last_ts:
        return _result(tag_id, target_label, "unknown", reason="Non-monotonic timestamp")

    history.last_ts = ts
    history.samples.append((ts, numeric))
    history.samples = history.samples[-window:]

    if history.ema_value is None:
        history.ema_value = numeric
    else:
        history.ema_value = EMA_ALPHA * numeric + (1.0 - EMA_ALPHA) * history.ema_value

    if len(history.samples) < 2:
        return _result(tag_id, target_label, "unknown", reason="Too few samples")

    prev_ts, prev_val = history.samples[-2]
    dt = (ts - prev_ts).total_seconds()
    if dt <= 0:
        return _result(tag_id, target_label, "unknown", reason="Invalid sample interval")

    instant_slope = (numeric - prev_val) / dt
    if history.ema_slope is None:
        history.ema_slope = instant_slope
    else:
        history.ema_slope = EMA_ALPHA * instant_slope + (1.0 - EMA_ALPHA) * history.ema_slope

    if len(history.samples) < MIN_SAMPLES:
        return _result(tag_id, target_label, "unknown", reason="Insufficient samples for projection")

    rate = history.ema_slope or 0.0
    smoothed = history.ema_value if history.ema_value is not None else numeric

    if smoothed >= threshold:
        return _result(
            tag_id,
            target_label,
            "exceeded",
            seconds_low=0.0,
            seconds_mid=0.0,
            seconds_high=0.0,
            confidence=0.9,
            reason="Threshold already exceeded",
        )

    if abs(rate) < 1e-9:
        return _result(
            tag_id,
            target_label,
            "stable",
            confidence=0.7,
            reason="Rate near zero — stable trend",
        )

    seconds = (threshold - smoothed) / rate
    if seconds <= 0:
        return _result(
            tag_id,
            target_label,
            "stable",
            confidence=0.6,
            reason="Not approaching limit on current trend",
        )

    band = max(5.0, seconds * MAX_BAND_RATIO)
    confidence = min(0.85, 0.4 + len(history.samples) * 0.05)
    return _result(
        tag_id,
        target_label,
        "approaching_limit",
        seconds_low=max(0.0, seconds - band),
        seconds_mid=seconds,
        seconds_high=seconds + band,
        confidence=confidence,
        reason="Advisory band from EMA slope — not for trip/control",
    )