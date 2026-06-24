"""EEMUA 191 / ISA-18.2 KPI tracking, per operating position (Domain J)."""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field


@dataclass
class AlarmKPIs:
    position: str
    window_min: int = 10
    events: deque = field(default_factory=lambda: deque(maxlen=10000))

    def record(self, ts: float) -> None:
        self.events.append(ts)

    def rate_per_10min(self, now: float) -> float:
        lo = now - self.window_min * 60
        return sum(1 for t in self.events if t >= lo)

    def in_flood(self, now: float) -> bool:
        return self.rate_per_10min(now) > 10

    def priority_distribution(self) -> dict[str, float]:
        return {"high": 0.05, "medium": 0.15, "low": 0.80}  # design targets
