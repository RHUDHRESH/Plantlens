"""Publish TagFrames to API ingest — non-blocking with bounded buffer."""

from __future__ import annotations

import asyncio
from collections import deque

import httpx
import structlog

from gateway.tag_frame import TagFrame

log = structlog.get_logger()


class FramePublisher:
    """Async HTTP publisher with retry buffer."""

    def __init__(self, *, api_base: str, token: str, max_buffer: int = 256) -> None:
        self._api_base = api_base.rstrip("/")
        self._token = token
        self._client: httpx.AsyncClient | None = None
        self._buffer: deque[TagFrame] = deque(maxlen=max_buffer)
        self._lock = asyncio.Lock()
        self._dropped = 0

    async def start(self) -> None:
        self._client = httpx.AsyncClient(timeout=5.0)

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    @property
    def buffered_count(self) -> int:
        return len(self._buffer)

    @property
    def dropped_count(self) -> int:
        return self._dropped

    async def publish(self, frame: TagFrame) -> None:
        """Enqueue frame; flush without blocking poll loop."""
        async with self._lock:
            if len(self._buffer) == self._buffer.maxlen:
                self._dropped += 1
            self._buffer.append(frame)
        asyncio.create_task(self._flush())

    async def _flush(self) -> None:
        async with self._lock:
            if not self._buffer or self._client is None:
                return
            batch = list(self._buffer)
            self._buffer.clear()
        url = f"{self._api_base}/api/ingest/frame"
        headers = {"Authorization": f"Bearer {self._token}"}
        payload = [f.model_dump(mode="json") for f in batch]
        try:
            if len(payload) == 1:
                response = await self._client.post(url, json=payload[0], headers=headers)
            else:
                response = await self._client.post(f"{url}/batch", json=payload, headers=headers)
            response.raise_for_status()
        except Exception as exc:
            log.warning("ingest_publish_failed", error=str(exc), count=len(batch))
            async with self._lock:
                for frame in batch:
                    if len(self._buffer) < self._buffer.maxlen:
                        self._buffer.appendleft(frame)
                    else:
                        self._dropped += 1