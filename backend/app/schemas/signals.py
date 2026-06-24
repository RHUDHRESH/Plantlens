"""Signal registry schema (Domain B)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class Band(BaseModel):
    """Hysteresis band: separate enter/exit thresholds stop chatter."""
    enter: float
    exit: float


class ThresholdSet(BaseModel):
    normal: Band | None = None
    warning_low: Band | None = None
    warning_high: Band | None = None
    critical_low: Band | None = None
    critical_high: Band | None = None


class SignalSpec(BaseModel):
    key: str
    instance_id: str  # binding to an asset instance
    kind: Literal["scalar", "composite"]
    unit: str | None = None
    sample_rate_hz: float | None = None
    channels: list[str] | None = None
    thresholds: ThresholdSet | None = None
    ne107_ref: str | None = None  # NE 107 status signal id if applicable


class SignalRegistry(BaseModel):
    signals: list[SignalSpec]
