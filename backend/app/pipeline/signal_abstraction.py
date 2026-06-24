"""Layer 1 — Signal Abstraction (Domain B/C).

Coerce raw CanonicalValue into the typed signal space: bind to the signal
registry, propagate NE 107 quality, keep composite payloads as fixed-length
numpy arrays (not Python lists) for FFT throughput. Outputs SignalState rows
ready for state estimation.
"""
from __future__ import annotations

from dataclasses import dataclass

from ..schemas.canonical import CanonicalValue


@dataclass
class SignalState:
    instance_id: str
    signal_key: str
    value: float | list[float]
    quality: str
    ts: float


def abstract(values: list[CanonicalValue]) -> list[SignalState]:
    """Map canonical values -> SignalState rows (scaffold: identity pass-through)."""
    return [SignalState(v.instance_id, v.signal_key, v.value, v.quality.value, v.ts)
            for v in values]
