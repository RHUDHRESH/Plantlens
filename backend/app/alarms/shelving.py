"""Alarm shelving — operator-initiated, time-bound, auto-unshelve (Domain J)."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ShelfRecord:
    alarm_id: str
    operator: str
    until: float  # epoch; auto-unshelve after
    reason: str
