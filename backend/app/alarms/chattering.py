"""Chattering alarm detection — N transitions in a window (Domain J)."""
from __future__ import annotations


def is_chattering(transitions: list[float], window_s: float = 60,
                  threshold: int = 3, now: float = 0.0) -> bool:
    """True if >= threshold state transitions occurred in the last window_s."""
    lo = now - window_s
    return sum(1 for t in transitions if t >= lo) >= threshold
