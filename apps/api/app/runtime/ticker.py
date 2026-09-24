"""Periodic runtime evaluator.

Frame-driven evaluation alone lets time-based logic (``for_ms`` debounces, tag staleness)
complete only when the *next* frame happens to arrive. The ticker re-evaluates on the runtime
clock at a fixed cadence so detection latency is bounded by the tick interval, not by the
frame rate. It never mutates graph or rules (R2); it only re-runs the same deterministic tick.
"""

from __future__ import annotations

import asyncio
import contextlib

import structlog

from app.runtime.simulator.simulator_gateway import SimulatorGateway

log = structlog.get_logger(__name__)


class RuntimeTicker:
    def __init__(self, gateway: SimulatorGateway, *, interval_ms: int) -> None:
        if interval_ms <= 0:
            raise ValueError("interval_ms must be positive")
        self._gateway = gateway
        self._interval_s = interval_ms / 1000.0
        self._task: asyncio.Task[None] | None = None
        self.ticks = 0
        self.pushes = 0

    @property
    def running(self) -> bool:
        return self._task is not None and not self._task.done()

    def start(self) -> None:
        if self.running:
            return
        self._task = asyncio.create_task(self._run(), name="plantlens-runtime-ticker")

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await self._task
        self._task = None

    async def _run(self) -> None:
        loop = asyncio.get_running_loop()
        next_at = loop.time()
        while True:
            next_at += self._interval_s
            try:
                if await self._gateway.tick():
                    self.pushes += 1
            except Exception:  # noqa: BLE001 — the ticker must survive any single bad tick
                log.exception("runtime_ticker_iteration_failed")
            self.ticks += 1
            # Fixed-rate schedule; if a tick overran, skip ahead instead of bursting.
            now = loop.time()
            if next_at < now:
                next_at = now
            await asyncio.sleep(next_at - now)
