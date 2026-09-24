"""Scan engine: one scan cycle per device, bounded timeouts, per-device backoff, quality stamping.

* A *device* is (source, unit). Each device runs its own scan loop at the source's ``poll_ms``.
  Devices sharing an RTU bus serialise on the transport lock, so a silent slave costs at most
  ``timeout * (retries + 1)`` of bus time per attempt, and while it is in backoff it costs none.
* Each cycle reads the planner's blocks in address order. The first timeout/CRC/link failure of a
  cycle puts the device in capped exponential backoff (0.25 s -> 5 s) and ends that cycle; the
  scan loop keeps ticking so STALE is still published on time.
* Quality: GOOD on a decoded read; BAD on an exception response or a codec error; STALE (value
  null) once the last GOOD read of a tag is older than its ``stale_after_ms`` (re-asserted once
  per stale period, not every scan).
* All traffic goes through :class:`ReadOnlyGuard` (FC01-04 only).
"""

from __future__ import annotations

import asyncio
import contextlib
import math
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import structlog

from gateway.modbus.batch_planner import BatchPlanner, PlannedTag, ReadBlock
from gateway.modbus.guard import ReadOnlyGuard, ReadOnlyViolation
from gateway.modbus.transports import (
    ILLEGAL_DATA_ADDRESS,
    ModbusCrcError,
    ModbusError,
    ModbusExceptionResponse,
    ModbusFrameError,
    ModbusLinkError,
    ModbusTimeout,
)
from gateway.register_codec import CodecError, decode
from gateway.tag_frame import TagFrame, TagQuality, TagSource

log = structlog.get_logger()

PublishFn = Callable[[TagFrame], Awaitable[Any]]


@dataclass(slots=True)
class ScanTiming:
    timeout_s: float = 0.25
    retries: int = 1
    inter_request_s: float = 0.0
    backoff_min_s: float = 0.25
    backoff_max_s: float = 5.0


@dataclass(slots=True)
class DeviceDiagnostics:
    source_id: str
    unit_id: int
    source: str
    requests: int = 0
    good_reads: int = 0
    timeouts: int = 0
    crc_errors: int = 0
    frame_errors: int = 0
    exception_responses: int = 0
    illegal_address_splits: int = 0
    link_errors: int = 0
    reconnects: int = 0
    scans: int = 0
    overruns: int = 0
    consecutive_failures: int = 0
    backoff_until: float = 0.0
    last_error: str | None = None
    last_good_read_ts: datetime | None = None
    last_scan_ms: float = 0.0
    stale_tags: set[str] = field(default_factory=set)

    @property
    def error_count(self) -> int:
        return self.timeouts + self.crc_errors + self.frame_errors + self.exception_responses + self.link_errors

    def as_dict(self) -> dict[str, Any]:
        return {
            "source_id": self.source_id,
            "unit_id": self.unit_id,
            "source": self.source,
            "requests": self.requests,
            "good_reads": self.good_reads,
            "timeouts": self.timeouts,
            "crc_errors": self.crc_errors,
            "frame_errors": self.frame_errors,
            "exception_responses": self.exception_responses,
            "illegal_address_splits": self.illegal_address_splits,
            "link_errors": self.link_errors,
            "reconnects": self.reconnects,
            "scans": self.scans,
            "overruns": self.overruns,
            "error_count": self.error_count,
            "in_backoff": self.backoff_until > time.monotonic(),
            "last_error": self.last_error,
            "last_good_read_ts": self.last_good_read_ts.isoformat() if self.last_good_read_ts else None,
            "last_scan_ms": round(self.last_scan_ms, 2),
            "stale_tag_count": len(self.stale_tags),
        }


@dataclass(slots=True)
class Device:
    source_id: str
    unit_id: int
    source: TagSource
    period_s: float
    planner: BatchPlanner
    guard: ReadOnlyGuard
    diag: DeviceDiagnostics
    reconnects_fn: Callable[[], int] | None = None


class ScanEngine:
    def __init__(self, *, gateway_id: str, publish: PublishFn, timing: ScanTiming | None = None) -> None:
        self._gateway_id = gateway_id
        self._publish = publish
        self.timing = timing or ScanTiming()
        self.devices: list[Device] = []
        self._seq = 0
        self._last_good: dict[str, float] = {}
        self._stale_sent: dict[str, float] = {}
        self._started = time.monotonic()
        self._tasks: list[asyncio.Task[None]] = []
        self.publish_errors = 0

    # ------------------------------------------------------------------ setup
    def add_device(
        self,
        *,
        source_id: str,
        unit_id: int,
        source: TagSource,
        poll_ms: int,
        tags: list[PlannedTag],
        guard: ReadOnlyGuard,
        planner: BatchPlanner | None = None,
        reconnects_fn: Callable[[], int] | None = None,
    ) -> Device:
        device = Device(
            source_id=source_id,
            unit_id=unit_id,
            source=source,
            period_s=max(poll_ms, 10) / 1000.0,
            planner=planner or BatchPlanner(source_id, unit_id, tags),
            guard=guard,
            diag=DeviceDiagnostics(source_id, unit_id, source),
            reconnects_fn=reconnects_fn,
        )
        self.devices.append(device)
        return device

    def requests_per_scan(self) -> int:
        return sum(len(d.planner.blocks) for d in self.devices)

    def snapshot(self) -> dict[str, Any]:
        for d in self.devices:
            if d.reconnects_fn:
                d.diag.reconnects = d.reconnects_fn()
        return {
            "requests_per_scan": self.requests_per_scan(),
            "publish_errors": self.publish_errors,
            "devices": [d.diag.as_dict() for d in self.devices],
        }

    # ------------------------------------------------------------------ run
    async def start(self) -> None:
        self._started = time.monotonic()
        for device in self.devices:
            self._tasks.append(asyncio.create_task(self._device_loop(device), name=f"scan-{device.source_id}-{device.unit_id}"))

    async def stop(self) -> None:
        for task in self._tasks:
            task.cancel()
        for task in self._tasks:
            with contextlib.suppress(asyncio.CancelledError):
                await task
        self._tasks.clear()

    async def run_forever(self) -> None:
        await self.start()
        try:
            await asyncio.gather(*self._tasks)
        finally:
            await self.stop()

    async def _device_loop(self, device: Device) -> None:
        next_tick = time.monotonic()
        while True:
            try:
                await self.scan_once(device)
            except asyncio.CancelledError:
                raise
            except ReadOnlyViolation:
                raise
            except Exception:  # never let one device's bug kill the engine
                log.exception("scan_cycle_failed", source=device.source_id, unit=device.unit_id)
            next_tick += device.period_s
            delay = next_tick - time.monotonic()
            if delay < 0:
                device.diag.overruns += 1
                next_tick = time.monotonic()
                delay = 0
            await asyncio.sleep(delay)

    # ------------------------------------------------------------------ one cycle
    async def scan_once(self, device: Device) -> None:
        diag = device.diag
        started = time.monotonic()
        diag.scans += 1
        if diag.backoff_until <= started:
            for index, block in enumerate(device.planner.blocks):
                if index and self.timing.inter_request_s > 0:
                    await asyncio.sleep(self.timing.inter_request_s)
                if device.planner.is_unreadable(block):
                    await self._publish_tags(device, block.tags, quality="BAD")
                    continue
                ok = await self._read_block(device, block)
                if not ok:
                    break
        await self._stale_sweep(device)
        diag.last_scan_ms = (time.monotonic() - started) * 1000.0

    def _enter_backoff(self, device: Device) -> None:
        diag = device.diag
        diag.consecutive_failures += 1
        delay = min(self.timing.backoff_min_s * (2 ** (diag.consecutive_failures - 1)), self.timing.backoff_max_s)
        diag.backoff_until = time.monotonic() + delay

    async def _read_block(self, device: Device, block: ReadBlock) -> bool:
        """Read one block (with retries). Returns False when the device should be skipped."""
        diag = device.diag
        request = block.request()
        attempts = self.timing.retries + 1
        last: ModbusError | None = None
        for _attempt in range(attempts):
            diag.requests += 1
            try:
                words = await device.guard.read(request, timeout=self.timing.timeout_s)
            except ModbusExceptionResponse as exc:
                diag.exception_responses += 1
                diag.last_error = str(exc)
                if exc.code == ILLEGAL_DATA_ADDRESS:
                    diag.illegal_address_splits += 1
                    if device.planner.split(block):
                        log.warning("modbus_block_split", source=block.source_id, start=block.start, count=block.count)
                        return True  # re-planned; next scan uses smaller blocks
                await self._publish_tags(device, block.tags, quality="BAD")
                return True  # the device answered: it is alive
            except ModbusTimeout as exc:
                diag.timeouts += 1
                last = exc
            except ModbusCrcError as exc:
                diag.crc_errors += 1
                last = exc
            except ModbusFrameError as exc:
                diag.frame_errors += 1
                last = exc
            except ModbusLinkError as exc:
                diag.link_errors += 1
                last = exc
                break  # no point retrying on a missing adapter/socket
            else:
                diag.good_reads += 1
                diag.consecutive_failures = 0
                diag.backoff_until = 0.0
                diag.last_error = None
                await self._publish_block(device, block, words)
                return True
        diag.last_error = str(last) if last else "read failed"
        self._enter_backoff(device)
        return False

    async def _publish_block(self, device: Device, block: ReadBlock, words: list[int]) -> None:
        now = datetime.now(UTC)
        mono = time.monotonic()
        device.diag.last_good_read_ts = now
        frames: list[TagFrame] = []
        for tag in block.tags:
            offset = tag.address - block.start
            regs = words[offset : offset + tag.width]
            quality: TagQuality = "GOOD"
            value: float | int | bool | None
            try:
                value = decode(regs, tag.codec, scale=tag.scale, offset=tag.offset)
                if isinstance(value, float) and not math.isfinite(value):
                    value, quality = None, "BAD"
            except CodecError:
                value, quality = None, "BAD"
            frame = self._frame(device, tag, value, quality, now)
            if frame is None:
                continue
            if quality == "GOOD":
                self._last_good[tag.tag_id] = mono
                self._stale_sent.pop(tag.tag_id, None)
                device.diag.stale_tags.discard(tag.tag_id)
            frames.append(frame)
        for frame in frames:
            await self._emit(frame)

    def _frame(self, device: Device, tag: PlannedTag, value: Any, quality: TagQuality, now: datetime) -> TagFrame | None:
        self._seq += 1
        try:
            return TagFrame(
                tag_id=tag.tag_id,
                asset_id=tag.asset_id,
                value=float(value) if isinstance(value, int) and not isinstance(value, bool) else value,
                unit=tag.unit,
                quality=quality,
                timestamp=now,
                source=device.source,
                seq=self._seq,
                gateway_id=self._gateway_id,
            )
        except Exception as exc:
            log.warning("modbus_frame_invalid", tag=tag.tag_id, error=str(exc))
            return None

    async def _emit(self, frame: TagFrame) -> None:
        try:
            await self._publish(frame)
        except Exception as exc:
            self.publish_errors += 1
            log.warning("modbus_publish_failed", error=str(exc))

    async def _publish_tags(self, device: Device, tags: tuple[PlannedTag, ...], *, quality: TagQuality) -> None:
        now = datetime.now(UTC)
        for tag in tags:
            frame = self._frame(device, tag, None, quality, now)
            if frame is not None:
                await self._emit(frame)

    async def _stale_sweep(self, device: Device) -> None:
        mono = time.monotonic()
        now = datetime.now(UTC)
        seen: set[str] = set()
        for block in device.planner.blocks:
            for tag in block.tags:
                if tag.tag_id in seen:
                    continue
                seen.add(tag.tag_id)
                last = self._last_good.get(tag.tag_id, self._started)
                if (mono - last) * 1000.0 < tag.stale_after_ms:
                    continue
                sent = self._stale_sent.get(tag.tag_id)
                if sent is not None and (mono - sent) * 1000.0 < tag.stale_after_ms:
                    continue
                self._stale_sent[tag.tag_id] = mono
                device.diag.stale_tags.add(tag.tag_id)
                frame = self._frame(device, tag, None, "STALE", now)
                if frame is not None:
                    await self._emit(frame)
