"""Passive Easy302/HMI Modbus RTU acquisition for the UNO Q deployment.

The HMI remains the only bus master.  This module only calls the firmware's
passive capture RPCs (``easy302/listen`` + ``easy302/drain``, falling back to
the bounded ``easy302/sniff``), validates observed RTU frames, and publishes raw
native register words as TagFrames.  It never calls the commissioning probe and
has no Modbus write surface.

Threads:

* capture thread  -- drains the MCU ring buffer (no blind window between calls
  when the firmware supports ``easy302/drain``), recovers CRC-valid frames,
  updates the register cache and enqueues TagFrames. It never does HTTP.
* publish thread  -- batches the queue to ``/api/ingest/frame/batch`` in order.
  5xx/network failures are retried with capped backoff (the batch stays at the
  head of the queue); 4xx batches are quarantined and counted; nothing is
  dropped silently (overflow drops the oldest frames and counts them).

When no valid response frame is observed for ``STALE_AFTER_MS`` every known
register is published once per stale period as ``quality="STALE"``, value null.
"""

from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.request
from collections import deque
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException


BAUDRATE = 38_400
FRAMING = 0  # Firmware enum: 0 = 8N1.
CAPTURE_MS = 1_000  # only used by the legacy blocking sniff fallback
DRAIN_INTERVAL_S = 0.1
STALE_AFTER_MS = int(os.environ.get("PLANTLENS_PASSIVE_STALE_AFTER_MS", "3000"))
PUBLISH_BATCH_MAX = 200
PUBLISH_QUEUE_MAX = 10_000
PORT_LABEL = "UNO-Q Serial1 D0/RX (passive RS485)"
GATEWAY_ID = "unoq-passive-rs485"
INGEST_URL = os.environ.get("PLANTLENS_INGEST_URL", "http://127.0.0.1:8000/api/ingest/frame/batch")


def modbus_crc(data: bytes) -> int:
    """Return the Modbus RTU CRC-16 value for *data*."""

    crc = 0xFFFF
    for value in data:
        crc ^= value
        for _ in range(8):
            crc = ((crc >> 1) ^ 0xA001) if crc & 1 else crc >> 1
    return crc


def _has_valid_crc(frame: bytes) -> bool:
    if len(frame) < 4:
        return False
    wire_crc = frame[-2] | (frame[-1] << 8)
    return modbus_crc(frame[:-2]) == wire_crc


def parse_bridge_segments(payload: str) -> list[bytes]:
    """Decode ``HEX,..,|,..,COUNT,n[,OVF,k]`` into byte segments split at t3.5 gaps."""

    parts = [part.strip() for part in payload.split(",")]
    if not parts or parts[0] != "HEX":
        raise ValueError("unexpected sniff response")
    try:
        count_index = parts.index("COUNT")
    except ValueError as exc:
        raise ValueError("sniff response is missing COUNT") from exc
    segments: list[bytes] = []
    current = bytearray()
    for part in parts[1:count_index]:
        if part == "|":
            if current:
                segments.append(bytes(current))
            current = bytearray()
        elif part:
            current.append(int(part, 16))
    if current:
        segments.append(bytes(current))
    declared = int(parts[count_index + 1])
    total = sum(len(s) for s in segments)
    if declared != total:
        raise ValueError(f"sniff byte count mismatch: {declared} != {total}")
    return segments


def parse_bridge_overflow(payload: str) -> int:
    parts = [part.strip() for part in payload.split(",")]
    if "OVF" in parts:
        idx = parts.index("OVF")
        if idx + 1 < len(parts):
            return int(parts[idx + 1])
    return 0


def parse_bridge_payload(payload: str) -> bytes:
    """Decode ``HEX,...,COUNT,n`` returned by the UNO firmware (gap markers ignored)."""

    return b"".join(parse_bridge_segments(payload))


def scan_rtu_frames(raw: bytes) -> list[bytes]:
    """Recover CRC-valid FC03/FC04 request and response frames from a byte stream.

    Captures can begin halfway through a frame, so invalid prefixes are skipped
    one byte at a time until a complete CRC-valid frame is found.
    """

    frames: list[bytes] = []
    offset = 0
    while offset + 5 <= len(raw):
        slave = raw[offset]
        function = raw[offset + 1]
        if not 1 <= slave <= 247 or function not in (3, 4):
            offset += 1
            continue

        candidates: list[int] = []
        byte_count = raw[offset + 2]
        if byte_count >= 2 and byte_count % 2 == 0:
            candidates.append(5 + byte_count)
        candidates.append(8)  # FC03/FC04 request.

        matched: bytes | None = None
        for length in candidates:
            end = offset + length
            if end <= len(raw):
                candidate = raw[offset:end]
                if _has_valid_crc(candidate):
                    matched = candidate
                    break
        if matched is None:
            offset += 1
            continue
        frames.append(matched)
        offset += len(matched)
    return frames


def _utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


class IngestPublisher:
    """Ordered, bounded, retrying publisher running on its own thread."""

    def __init__(self, url: str = INGEST_URL, *, post=None) -> None:
        self._url = url
        self._post = post or self._http_post
        self._queue: deque[dict[str, Any]] = deque()
        self._cond = threading.Condition()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._backoff = 0.5
        self.accepted = 0
        self.not_accepted = 0
        self.sent = 0
        self.dropped = 0
        self.quarantined = 0
        self.failures = 0
        self.last_error: str | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="plantlens-passive-publish", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        with self._cond:
            self._cond.notify_all()
        if self._thread:
            self._thread.join(2.0)

    def enqueue(self, frames: list[dict[str, Any]]) -> None:
        if not frames:
            return
        with self._cond:
            self._queue.extend(frames)
            while len(self._queue) > PUBLISH_QUEUE_MAX:
                self._queue.popleft()
                self.dropped += 1
            self._cond.notify()

    @property
    def depth(self) -> int:
        with self._cond:
            return len(self._queue)

    @staticmethod
    def _http_post(url: str, frames: list[dict[str, Any]]) -> tuple[int, dict[str, Any] | str]:
        token = os.environ.get("GATEWAY_INGEST_TOKEN", "change-me")
        request = urllib.request.Request(
            url,
            data=json.dumps(frames).encode("utf-8"),
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=4) as response:
                return response.status, json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            return exc.code, exc.read().decode("utf-8", errors="replace")[:300]

    def flush_once(self) -> bool:
        """Send one batch; False means 'retry later'."""
        with self._cond:
            batch = [self._queue.popleft() for _ in range(min(PUBLISH_BATCH_MAX, len(self._queue)))]
        if not batch:
            return True
        try:
            status, body = self._post(self._url, batch)
        except Exception as exc:  # network error: keep order, retry
            status, body = None, f"{type(exc).__name__}: {exc}"
        if status is not None and 200 <= status < 300:
            self._backoff = 0.5
            self.sent += len(batch)
            accepted = int(body.get("accepted", len(batch))) if isinstance(body, dict) else len(batch)
            self.accepted += accepted
            self.not_accepted += max(0, len(batch) - accepted)
            self.last_error = None
            return True
        self.failures += 1
        self.last_error = f"HTTP {status}: {body}" if status is not None else str(body)
        if status is not None and 400 <= status < 500 and status not in (408, 429):
            self.quarantined += len(batch)
            return True
        with self._cond:
            self._queue.extendleft(reversed(batch))
            while len(self._queue) > PUBLISH_QUEUE_MAX:
                self._queue.popleft()
                self.dropped += 1
        return False

    def _run(self) -> None:
        while not self._stop.is_set():
            with self._cond:
                if not self._queue:
                    self._cond.wait(0.25)
            if self.flush_once():
                continue
            self._stop.wait(self._backoff)
            self._backoff = min(self._backoff * 2, 10.0)


class PassiveGateway:
    """Continuously observe the HMI-owned bus and publish native raw words."""

    def __init__(self, publisher: IngestPublisher | None = None) -> None:
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._pending: dict[int, tuple[int, int, int]] = {}
        self._registers: dict[str, dict[str, Any]] = {}
        self._seq = 0
        self._started_at: str | None = None
        self._last_capture_ts: str | None = None
        self._last_data_ts: str | None = None
        self._last_data_monotonic: float | None = None
        self._last_response_monotonic: float | None = None
        self._stale_sent_monotonic: float | None = None
        self._last_error: str | None = None
        self._error_count = 0
        self._bytes_seen = 0
        self._capture_overflows = 0
        self._valid_frames = 0
        self._request_frames = 0
        self._response_frames = 0
        self._register_updates = 0
        self._stale_publications = 0
        self._drain_supported: bool | None = None
        self.publisher = publisher or IngestPublisher()

    def start(self) -> None:
        with self._lock:
            if self._thread and self._thread.is_alive():
                return
            self._stop.clear()
            self._started_at = _utc_now()
            self.publisher.start()
            self._thread = threading.Thread(
                target=self._run,
                name="plantlens-passive-rs485",
                daemon=True,
            )
            self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(3.0)
        self.publisher.stop()

    def _bridge_call(self, *args: Any, timeout: float = 3) -> str:
        # Arduino's package exists only in the UNO Q application container.
        from arduino.app_utils import Bridge

        return Bridge.call(*args, timeout=timeout)

    def _capture_once(self) -> list[bytes]:
        """Return byte segments captured since the last call (split at t3.5 gaps)."""
        if self._drain_supported is None:
            try:
                self._bridge_call("easy302/listen", BAUDRATE, FRAMING)
                self._drain_supported = True
            except Exception:
                self._drain_supported = False  # older firmware: bounded blocking sniff
        if self._drain_supported:
            payload = self._bridge_call("easy302/drain")
            with self._lock:
                self._capture_overflows += parse_bridge_overflow(payload)
            return parse_bridge_segments(payload)
        payload = self._bridge_call("easy302/sniff", BAUDRATE, FRAMING, CAPTURE_MS)
        return parse_bridge_segments(payload)

    def _observation(self, tag_id: str, slave: int, value: float | None, quality: str, now: str) -> dict[str, Any]:
        self._seq += 1
        return {
            "tag_id": tag_id,
            "asset_id": f"MODBUS-S{slave}",
            "value": value,
            "unit": "raw_word",
            "quality": quality,
            "timestamp": now,
            "source": "modbus_rtu",
            "seq": self._seq,
            "gateway_id": GATEWAY_ID,
        }

    def _decode(self, frames: list[bytes]) -> list[dict[str, Any]]:
        tag_frames: list[dict[str, Any]] = []
        now = _utc_now()
        for frame in frames:
            slave = frame[0]
            function = frame[1]
            if len(frame) == 8:
                address = (frame[2] << 8) | frame[3]
                count = (frame[4] << 8) | frame[5]
                self._pending[slave] = (function, address, count)
                self._request_frames += 1
                continue

            pending = self._pending.get(slave)
            if pending is None:
                continue
            request_function, address, count = pending
            byte_count = frame[2]
            if function != request_function or byte_count != count * 2:
                continue

            self._response_frames += 1
            self._last_response_monotonic = time.monotonic()
            self._stale_sent_monotonic = None
            table = "HR" if function == 3 else "IR"
            for index in range(count):
                pos = 3 + index * 2
                word = (frame[pos] << 8) | frame[pos + 1]
                register = address + index
                tag_id = f"NATIVE_S{slave}_{table}_{register:05d}"
                register_table = "hreg" if function == 3 else "ireg"
                channel_ref = f"modbus:slave{slave}:{register_table}:{register}"
                observation = self._observation(tag_id, slave, float(word), "GOOD", now)
                self._registers[tag_id] = {
                    **observation,
                    "slave_id": slave,
                    "function": function,
                    "register": register,
                    "channel_ref": channel_ref,
                }
                tag_frames.append(observation)
                self._register_updates += 1
        return tag_frames

    def _stale_frames(self) -> list[dict[str, Any]]:
        """STALE for every known register once per stale period of bus silence."""
        now_mono = time.monotonic()
        reference = self._last_response_monotonic
        if reference is None or not self._registers:
            return []
        if (now_mono - reference) * 1000 < STALE_AFTER_MS:
            return []
        if self._stale_sent_monotonic is not None and (now_mono - self._stale_sent_monotonic) * 1000 < STALE_AFTER_MS:
            return []
        self._stale_sent_monotonic = now_mono
        now = _utc_now()
        frames = []
        for tag_id, row in self._registers.items():
            row["quality"] = "STALE"  # cached raw value kept for commissioning views
            frames.append(self._observation(tag_id, int(row["slave_id"]), None, "STALE", now))
        self._stale_publications += 1
        return frames

    def _run(self) -> None:
        # Let Uvicorn bind before the first local ingest POST.
        self._stop.wait(1.5)
        while not self._stop.is_set():
            try:
                segments = self._capture_once()
                raw_len = sum(len(s) for s in segments)
                frames = [frame for segment in segments for frame in scan_rtu_frames(segment)]
                with self._lock:
                    self._last_capture_ts = _utc_now()
                    if raw_len:
                        self._last_data_ts = self._last_capture_ts
                        self._last_data_monotonic = time.monotonic()
                    self._bytes_seen += raw_len
                    self._valid_frames += len(frames)
                    tag_frames = self._decode(frames)
                    tag_frames.extend(self._stale_frames())
                    self._last_error = None
                self.publisher.enqueue(tag_frames)
            except Exception as exc:  # Keep acquisition alive and surface exact status.
                with self._lock:
                    self._last_error = f"{type(exc).__name__}: {exc}"
                    self._error_count += 1
                    stale = self._stale_frames()
                self.publisher.enqueue(stale)
                self._stop.wait(0.25)
                continue
            if self._drain_supported:
                self._stop.wait(DRAIN_INTERVAL_S)

    def status(self) -> dict[str, Any]:
        with self._lock:
            latest = list(self._registers.values())
            data_age = (
                None
                if self._last_data_monotonic is None
                else time.monotonic() - self._last_data_monotonic
            )
            connected = (
                data_age is not None
                and data_age <= max(3.0, 3 * CAPTURE_MS / 1000)
                and self._last_error is None
            )
            return {
                "connected": connected,
                "mode": "passive_listener",
                "read_only": True,
                "port": PORT_LABEL,
                "baudrate": BAUDRATE,
                "framing": "8N1",
                "slave_id": None,
                "poll_hz": 1 / DRAIN_INTERVAL_S if self._drain_supported else 1000 / CAPTURE_MS,
                "capture": "continuous" if self._drain_supported else "windowed_sniff",
                "last_poll_ts": self._last_capture_ts,
                "last_data_ts": self._last_data_ts,
                "ok_count": self._response_frames,
                "error_count": self._error_count,
                "last_error": self._last_error,
                "started_at": self._started_at,
                "bytes_seen": self._bytes_seen,
                "capture_overflows": self._capture_overflows,
                "valid_frames": self._valid_frames,
                "request_frames": self._request_frames,
                "response_frames": self._response_frames,
                "register_updates": self._register_updates,
                "stale_publications": self._stale_publications,
                "ingest_accepted": self.publisher.accepted,
                "ingest_not_accepted": self.publisher.not_accepted,
                "ingest_queue_depth": self.publisher.depth,
                "ingest_dropped": self.publisher.dropped,
                "ingest_quarantined": self.publisher.quarantined,
                "ingest_failures": self.publisher.failures,
                "ingest_last_error": self.publisher.last_error,
                "native_register_count": len(latest),
                "observed_slave_ids": sorted({row["slave_id"] for row in latest}),
            }

    def register_rows(self) -> list[dict[str, Any]]:
        with self._lock:
            return sorted(
                (dict(row) for row in self._registers.values()),
                key=lambda row: (row["slave_id"], row["register"]),
            )


gateway = PassiveGateway()
router = APIRouter(tags=["uno-q-passive-rs485"])


@router.get("/api/ports")
async def compatibility_ports() -> dict[str, Any]:
    return {"ports": [{"device": PORT_LABEL, "mode": "passive_listener"}]}


@router.get("/api/connection/status")
async def compatibility_connection_status() -> dict[str, Any]:
    return gateway.status()


@router.get("/api/model")
async def compatibility_model() -> dict[str, Any]:
    return {
        "plant_id": "easy302-live-native",
        "tags": gateway.register_rows(),
        "mapping_state": "native_raw_uncommissioned",
    }


@router.post("/api/connection")
async def compatibility_connect(payload: dict[str, Any]) -> dict[str, Any]:
    requested = int(payload.get("baudrate", BAUDRATE))
    if requested != BAUDRATE:
        raise HTTPException(
            status_code=422,
            detail=f"Live HMI bus is commissioned at {BAUDRATE} baud, 8N1",
        )
    gateway.start()
    return gateway.status()


@router.post("/api/scan")
async def compatibility_scan(payload: dict[str, Any]) -> dict[str, Any]:
    start = int(payload.get("start_reg", payload.get("startReg", 0)))
    count = int(payload.get("count", 42))
    end = start + max(0, count)
    rows = []
    for row in gateway.register_rows():
        if not start <= row["register"] < end:
            continue
        rows.append(
            {
                "channel_ref": row["channel_ref"],
                "register": row["register"],
                "reg_type": "holding" if row["function"] == 3 else "input",
                "data_type": "uint16",
                "word_order": "AB",
                "raw": int(row["value"]),
                "decoded": row["value"],
                "responding": row["quality"] == "GOOD",
                "quality": row["quality"],
                "suggested_tag": row["tag_id"],
                "bound_tag": None,
                "equipment": row["asset_id"],
            }
        )
    return {"rows": rows, "source": "passive_cache", "read_only": True}


@router.post("/api/test")
async def compatibility_test(payload: dict[str, Any]) -> dict[str, Any]:
    channel_ref = str(payload.get("channel_ref", payload.get("channelRef", "")))
    row = next(
        (item for item in gateway.register_rows() if item["channel_ref"] == channel_ref),
        None,
    )
    if row is None:
        return {"ok": False, "value": None, "error": "No cached passive observation"}
    return {"ok": True, "value": row["value"], "latency_ms": 0, "quality": row["quality"]}
