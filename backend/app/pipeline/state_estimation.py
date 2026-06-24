"""Layer 2 — State Estimation (Domain D).

continuous -> discrete via hysteresis banding (separate enter/exit thresholds
stop chatter) + constant-velocity Kalman filter (dim_x=2, dim_z=1,
F=[[1,dt],[0,1]]) giving trend + time-to-threshold with a confidence band from
state covariance P. Quality-gated: bad quality -> state UNKNOWN, never NORMAL
(feeding bad samples poisons the trend). Composite feature extraction:
scipy.fft.rfft for spectra, RMS, three-phase imbalance = max dev from mean / mean x 100%.

NOTE: filterpy is optional (unmaintained). A 20-line numpy CV filter is the
preferred fallback (see Caveats in the build plan).
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from .signal_abstraction import SignalState


class Band(StrEnum):
    NORMAL = "normal"
    WARNING = "warning"
    CRITICAL = "critical"
    UNKNOWN = "unknown"


@dataclass
class EstimatedState:
    instance_id: str
    signal_key: str
    band: Band
    value: float
    rate: float  # d/dt (Kalman state[1])
    time_to_threshold_s: float | None  # with confidence band from P
    confidence_band: tuple[float, float] | None
    ts: float


def estimate(states: list[SignalState], dt: float = 1.0) -> list[EstimatedState]:
    """Apply banding + Kalman trend per signal (scaffold: band only, no filter)."""
    out: list[EstimatedState] = []
    for s in states:
        band = Band.UNKNOWN if s.quality == "bad" else Band.NORMAL
        out.append(EstimatedState(s.instance_id, s.signal_key, band,
                                  s.value if isinstance(s.value, (int, float)) else 0.0,
                                  0.0, None, None, s.ts))
    return out
