"""Line-mode acquisition: SerialLink -> LineFramer -> LineDecoder -> TagFrames.

The reader owns no port logic (that is :class:`SerialLink`). It:

* resets the framer on every new link generation (a stream joined mid-line never yields a
  truncated first line unless the link saw the ready banner and is line-aligned);
* converts readings to TagFrames per line, catching every error per line;
* publishes STALE (value null) for any tag whose last GOOD reading is older than its
  ``stale_after_ms`` — including while the link is down — and re-asserts it every stale period.
"""

from __future__ import annotations

import asyncio
import contextlib
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any

import structlog

from gateway.line.framer import LineFramer
from gateway.line.protocols import LineDecoder, LineTagSpec, Reading
from gateway.tag_frame import TagFrame, TagSource
from gateway.transport.serial_link import LinkDown, SerialLink

log = structlog.get_logger()

PublishFn = Callable[[TagFrame], Awaitable[Any]]


def readings_to_frames(
    readings: list[Reading],
    *,
    tag_index: dict[str, LineTagSpec],
    gateway_id: str,
    source: TagSource,
    first_seq: int,
    now: datetime,
    on_invalid: Callable[[str], None] | None = None,
) -> list[TagFrame]:
    frames: list[TagFrame] = []
    seq = first_seq
    for reading in readings:
        spec = tag_index.get(reading.tag_id)
        if spec is None:
            continue
        try:
            frame = TagFrame(
                tag_id=spec.tag_id,
                asset_id=spec.asset_id,
                value=reading.value,
                unit=spec.unit,
                quality=reading.quality,
                timestamp=now,
                source=source,
                seq=seq,
                gateway_id=gateway_id,
            )
        except Exception as exc:  # e.g. tag map asset_id violates the contract pattern
            if on_invalid:
                on_invalid(f"{reading.tag_id}: {exc}")
            continue
        frames.append(frame)
        seq += 1
    return frames


class LineReader:
    def __init__(
        self,
        *,
        link: SerialLink,
        decoder: LineDecoder,
        gateway_id: str,
        publish: PublishFn,
        source: TagSource = "manual",
        max_line_bytes: int = 512,
        stale_check_s: float = 0.1,
    ) -> None:
        self.link = link
        self.decoder = decoder
        self.framer = LineFramer(max_line_bytes)
        self._gateway_id = gateway_id
        self._publish = publish
        self._source: TagSource = source
        self._stale_check_s = stale_check_s
        self._seq = 0
        self._last_good: dict[str, float] = {}
        self._stale_sent: dict[str, float] = {}
        self._started = time.monotonic()
        self.frame_invalid = 0
        self.publish_errors = 0
        self.last_good_read_ts: datetime | None = None

    @property
    def stale_tags(self) -> list[str]:
        return sorted(self._stale_sent)

    def snapshot(self) -> dict[str, Any]:
        return {
            "link": self.link.snapshot(),
            "framer": self.framer.stats.as_dict(),
            "decoder": self.decoder.stats.as_dict(),
            "frame_invalid": self.frame_invalid,
            "publish_errors": self.publish_errors,
            "stale_tags": self.stale_tags,
            "last_good_read_ts": self.last_good_read_ts.isoformat() if self.last_good_read_ts else None,
        }

    def _invalid(self, detail: str) -> None:
        self.frame_invalid += 1
        log.warning("line_frame_invalid", detail=detail)

    async def _emit(self, frames: list[TagFrame]) -> None:
        for frame in frames:
            try:
                await self._publish(frame)
            except Exception as exc:
                self.publish_errors += 1
                log.warning("line_publish_failed", error=str(exc))

    async def handle_line(self, line: str, now: datetime | None = None) -> list[TagFrame]:
        readings = self.decoder.decode(line)
        if not readings:
            return []
        stamp = now or datetime.now(UTC)
        frames = readings_to_frames(
            readings,
            tag_index=self.decoder.tag_index,
            gateway_id=self._gateway_id,
            source=self._source,
            first_seq=self._seq + 1,
            now=stamp,
            on_invalid=self._invalid,
        )
        self._seq += len(frames)
        mono = time.monotonic()
        for frame in frames:
            if frame.quality == "GOOD":
                self._last_good[frame.tag_id] = mono
                self._stale_sent.pop(frame.tag_id, None)
                self.last_good_read_ts = stamp
        await self._emit(frames)
        return frames

    async def check_stale(self, now_mono: float | None = None) -> list[TagFrame]:
        mono = time.monotonic() if now_mono is None else now_mono
        due: list[Reading] = []
        for tag_id, spec in self.decoder.tag_index.items():
            last = self._last_good.get(tag_id)
            if last is None:
                if tag_id not in self._interesting_tags():
                    continue
                last = self._started
            age_ms = (mono - last) * 1000.0
            if age_ms < spec.stale_after_ms:
                continue
            sent = self._stale_sent.get(tag_id)
            if sent is not None and (mono - sent) * 1000.0 < spec.stale_after_ms:
                continue
            self._stale_sent[tag_id] = mono
            due.append(Reading(tag_id, None, "STALE"))
        if not due:
            return []
        frames = readings_to_frames(
            due,
            tag_index=self.decoder.tag_index,
            gateway_id=self._gateway_id,
            source=self._source,
            first_seq=self._seq + 1,
            now=datetime.now(UTC),
            on_invalid=self._invalid,
        )
        self._seq += len(frames)
        await self._emit(frames)
        return frames

    def _interesting_tags(self) -> set[str]:
        """Tags this stream is expected to deliver: explicitly mapped columns/keys, plus any tag
        seen at least once (the bare-number default tag only counts once it has been seen)."""
        return set(self.decoder.column_map.values()) | set(self._last_good)

    async def _stale_loop(self) -> None:
        while True:
            await asyncio.sleep(self._stale_check_s)
            try:
                await self.check_stale()
            except Exception:
                log.exception("line_stale_check_failed")

    async def run_forever(self) -> None:
        await self.link.start()
        stale_task = asyncio.create_task(self._stale_loop())
        try:
            generation = -1
            while True:
                if not self.link.connected:
                    await self.link.wait_connected()
                if self.link.generation != generation:
                    generation = self.link.generation
                    self.framer.reset(discard_until_newline=not self.link.aligned)
                    self.decoder.reset_stream()
                try:
                    chunk = await self.link.read(0.5)
                except LinkDown:
                    self.framer.reset()
                    continue
                if not chunk:
                    continue  # timeout: partial bytes stay buffered, never emitted
                for line in self.framer.feed(chunk):
                    await self.handle_line(line)
        finally:
            stale_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await stale_task
