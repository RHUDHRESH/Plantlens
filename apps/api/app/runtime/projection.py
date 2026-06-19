"""Advisory time-to-consequence projection — never on trip path."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


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


_history: dict[str, _TagHistory] = {}


def reset_projection_history() -> None:
    _history.clear()


def update_projection(
    tag_id: str,
    value: float | None,
    ts: datetime,
    *,
    threshold: float,
    target_label: str,
    window: int = 5,
) -> dict[str, Any] | None:
    if value is None:
        return {
            "target_tag": tag_id,
            "target_label": target_label,
            "state": "unknown",
            "seconds_low": None,
            "seconds_high": None,
        }

    history = _history.setdefault(tag_id, _TagHistory())
    history.samples.append((ts, float(value)))
    history.samples = history.samples[-window:]

    if len(history.samples) < 2:
        return {
            "target_tag": tag_id,
            "target_label": target_label,
            "state": "unknown",
            "seconds_low": None,
            "seconds_high": None,
        }

    first_ts, first_val = history.samples[0]
    last_ts, last_val = history.samples[-1]
    dt = (last_ts - first_ts).total_seconds()
    if dt <= 0:
        return {
            "target_tag": tag_id,
            "target_label": target_label,
            "state": "stable",
            "seconds_low": None,
            "seconds_high": None,
        }

    rate = (last_val - first_val) / dt
    if rate >= 0:
        return {
            "target_tag": tag_id,
            "target_label": target_label,
            "state": "stable",
            "seconds_low": None,
            "seconds_high": None,
        }

    seconds = (threshold - last_val) / rate
    band = max(5.0, seconds * 0.15)
    return {
        "target_tag": tag_id,
        "target_label": target_label,
        "state": "counting",
        "seconds_low": max(0.0, seconds - band),
        "seconds_high": seconds + band,
    }