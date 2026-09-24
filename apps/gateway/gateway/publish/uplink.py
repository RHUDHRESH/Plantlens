"""Ordered, batched uplink of TagFrames to the API ingest endpoint.

* ``publish()`` only enqueues (never blocks the acquisition loop, never spawns a task).
* ONE background task drains the bounded queue in order: a batch leaves when it reaches
  ``batch_max`` frames (default 200) or every ``flush_interval_s`` (default 250 ms).
* 2xx: the ``accepted``/``total`` body is checked; frames the API did not accept are counted.
* 4xx (except 408/429): the batch is quarantined — logged, counted, never retried, so one bad
  frame cannot block the queue forever.
* 5xx, 408, 429 and network errors: the batch is put back at the head in its original order and
  retried with capped exponential backoff.
* Queue overflow drops the OLDEST frames (live telemetry: newest wins) and counts them.
"""

from __future__ import annotations

import asyncio
import contextlib
import time
from collections import deque
from typing import Any

import httpx
import structlog

from gateway.tag_frame import TagFrame

log = structlog.get_logger()

RETRYABLE_4XX = {408, 429}


class Uplink:
    def __init__(
        self,
        *,
        api_base: str,
        token: str,
        batch_max: int = 200,
        flush_interval_s: float = 0.25,
        queue_max: int = 5000,
        timeout_s: float = 5.0,
        backoff_min_s: float = 0.5,
        backoff_max_s: float = 10.0,
        transport: httpx.AsyncBaseTransport | None = None,
        max_buffer: int | None = None,  # legacy FramePublisher name for queue_max
    ) -> None:
        self._url = f"{api_base.rstrip('/')}/api/ingest/frame/batch"
        self._headers = {"Authorization": f"Bearer {token}"}
        self.batch_max = max(1, batch_max)
        self.flush_interval_s = flush_interval_s
        self.queue_max = max_buffer or queue_max
        self._timeout_s = timeout_s
        self._backoff_min_s = backoff_min_s
        self._backoff_max_s = backoff_max_s
        self._transport = transport
        self._queue: deque[TagFrame] = deque()
        self._wake = asyncio.Event()
        self._client: httpx.AsyncClient | None = None
        self._task: asyncio.Task[None] | None = None
        self._backoff = backoff_min_s
        self._retry_at = 0.0
        self.sent_batches = 0
        self.sent_frames = 0
        self.accepted_frames = 0
        self.not_accepted_frames = 0
        self.dropped = 0
        self.quarantined = 0
        self.quarantined_batches = 0
        self.retries = 0
        self.last_error: str | None = None
        self.last_status: int | None = None

    # ------------------------------------------------------------------ lifecycle
    async def start(self) -> None:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self._timeout_s, transport=self._transport)
        if self._task is None:
            self._task = asyncio.create_task(self._run(), name="uplink")

    async def close(self, drain_timeout_s: float = 2.0) -> None:
        if self._task is not None:
            deadline = time.monotonic() + drain_timeout_s
            while self._queue and time.monotonic() < deadline and self._retry_at <= time.monotonic():
                self._wake.set()
                await asyncio.sleep(0.02)
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    # ------------------------------------------------------------------ producer side
    async def publish(self, frame: TagFrame) -> None:
        self.enqueue(frame)

    def enqueue(self, frame: TagFrame) -> None:
        self._queue.append(frame)
        self._trim()
        if len(self._queue) >= self.batch_max:
            self._wake.set()

    def _trim(self) -> None:
        while len(self._queue) > self.queue_max:
            self._queue.popleft()
            self.dropped += 1

    # legacy FramePublisher surface
    @property
    def buffered_count(self) -> int:
        return len(self._queue)

    @property
    def dropped_count(self) -> int:
        return self.dropped

    @property
    def queue_depth(self) -> int:
        return len(self._queue)

    def snapshot(self) -> dict[str, Any]:
        return {
            "queue_depth": len(self._queue),
            "queue_max": self.queue_max,
            "dropped": self.dropped,
            "quarantined": self.quarantined,
            "quarantined_batches": self.quarantined_batches,
            "sent_batches": self.sent_batches,
            "sent_frames": self.sent_frames,
            "accepted_frames": self.accepted_frames,
            "not_accepted_frames": self.not_accepted_frames,
            "retries": self.retries,
            "last_status": self.last_status,
            "last_error": self.last_error,
        }

    # ------------------------------------------------------------------ consumer side
    async def _run(self) -> None:
        while True:
            wait = self.flush_interval_s
            if self._retry_at:
                wait = max(0.0, self._retry_at - time.monotonic())
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self._wake.wait(), wait)
            self._wake.clear()
            if self._retry_at and time.monotonic() < self._retry_at:
                continue
            self._retry_at = 0.0
            while self._queue:
                ok = await self.flush_once()
                if not ok:
                    break
                if len(self._queue) < self.batch_max:
                    break  # partial batch: wait for the next tick

    async def flush_once(self) -> bool:
        """Send one batch. Returns False if it must be retried later."""
        if not self._queue:
            return True
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self._timeout_s, transport=self._transport)
        batch = [self._queue.popleft() for _ in range(min(self.batch_max, len(self._queue)))]
        payload = [frame.to_contract() for frame in batch]
        try:
            response = await self._client.post(self._url, json=payload, headers=self._headers)
        except httpx.HTTPError as exc:
            self._requeue(batch, f"{type(exc).__name__}: {exc}")
            return False
        self.last_status = response.status_code
        if response.is_success:
            self._backoff = self._backoff_min_s
            self.sent_batches += 1
            self.sent_frames += len(batch)
            accepted = len(batch)
            try:
                body = response.json()
                accepted = int(body.get("accepted", len(batch)))
                total = int(body.get("total", len(batch)))
            except Exception:
                total = len(batch)
            self.accepted_frames += accepted
            if accepted < total:
                self.not_accepted_frames += total - accepted
                log.warning("uplink_partially_accepted", accepted=accepted, total=total)
            self.last_error = None
            return True
        if 400 <= response.status_code < 500 and response.status_code not in RETRYABLE_4XX:
            self.quarantined += len(batch)
            self.quarantined_batches += 1
            self.last_error = f"HTTP {response.status_code}: {response.text[:200]}"
            log.error(
                "uplink_batch_quarantined",
                status=response.status_code,
                frames=len(batch),
                first_tag=batch[0].tag_id,
                body=response.text[:500],
            )
            return True
        self._requeue(batch, f"HTTP {response.status_code}: {response.text[:200]}")
        return False

    def _requeue(self, batch: list[TagFrame], error: str) -> None:
        self.retries += 1
        self.last_error = error
        self._queue.extendleft(reversed(batch))
        self._trim()
        self._retry_at = time.monotonic() + self._backoff
        log.warning("uplink_retry", error=error, frames=len(batch), retry_s=self._backoff)
        self._backoff = min(self._backoff * 2, self._backoff_max_s)
