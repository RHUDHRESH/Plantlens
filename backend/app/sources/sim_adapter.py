"""Deterministic simulator adapter (Domain C / X).

The sim adapter is just another SourceAdapter, so the demo exercises the REAL
pipeline, not a mock. It replays scenarios from models/scenarios/*.json and
produces valid CanonicalValues per tick. No hardware required.
"""
from __future__ import annotations

import json
import time

from ..config import MODELS_DIR
from ..schemas.canonical import CanonicalValue, Quality
from .base import SourceAdapter


class SimAdapter(SourceAdapter):
    id = "sim"

    def __init__(self, scenario: str | None = "bearing_cascade") -> None:
        self.scenario_path = MODELS_DIR / "scenarios" / f"{scenario}.json"
        self.timeline: list[dict] = []
        if self.scenario_path.exists():
            data = json.loads(self.scenario_path.read_text(encoding="utf-8"))
            self.timeline = data.get("timeline", [])
        self._start = time.time()

    async def read(self) -> list[CanonicalValue]:
        # Scaffold: return scheduled injections whose time has come.
        now = time.time() - self._start
        out: list[CanonicalValue] = []
        for evt in self.timeline:
            if evt["t"] <= now < evt["t"] + 1.0:
                inj = evt["inject"]
                out.append(CanonicalValue(
                    instance_id=inj["instance"],
                    signal_key=inj["signal"],
                    value=inj["value"],
                    quality=Quality(inj.get("quality", "good")),
                    ts=now,
                    source=self.id,
                ))
        return out
