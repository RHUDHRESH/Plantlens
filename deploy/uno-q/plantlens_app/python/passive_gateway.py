"""Passive Easy302/HMI Modbus RTU acquisition for the UNO Q deployment.

The HMI remains the only bus master.  This module only calls the firmware's
``easy302/sniff`` RPC, validates observed RTU frames, and publishes raw native
register words as TagFrames.  It never calls the commissioning probe and has
no Modbus write surface.
"""

from __future__ import annotations

import json
import os
import threading
import time
import urllib.request
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException


BAUDRATE = 38_400
FRAMING = 0  # Firmware enum: 0 = 8N1.
CAPTURE_MS = 1_000
PORT_LABEL = "UNO-Q Serial1 D0/RX (passive RS485)"
GATEWAY_ID = "unoq-passive-rs485"


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


def parse_bridge_payload(payload: str) -> bytes:
    """Decode ``HEX,...,COUNT,n`` returned by the UNO firmware."""

    parts = [part.strip() for part in payload.split(",")]
    if not parts or parts[0] != "HEX":
        raise ValueError("unexpected sniff response")
    try:
        count_index = parts.index("COUNT")
    except ValueError as exc:
        raise ValueError("sniff response is missing COUNT") from exc
    raw = bytes(int(part, 16) for part in parts[1:count_index] if part)
    declared = int(parts[count_index + 1])
    if declared != len(raw):
        raise ValueError(f"sniff byte count mismatch: {declared} != {len(raw)}")
    return raw


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


class PassiveGateway:
    """Continuously observe the HMI-owned bus and publish native raw words."""

    def __init__(self) -> None:
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
        self._last_error: str | None = None
        self._bytes_seen = 0
        self._valid_frames = 0
        self._request_frames = 0
        self._response_frames = 0
        self._register_updates = 0
        self._ingest_accepted = 0

    def start(self) -> None:
        with self._lock:
            if self._thread and self._thread.is_alive():
                return
            self._stop.clear()
            self._started_at = _utc_now()
            self._thread = threading.Thread(
                target=self._run,
                name="plantlens-passive-rs485",
                daemon=True,
            )
            self._thread.start()

    def _capture_once(self) -> bytes:
        # Arduino's package exists only in the UNO Q application container.
        from arduino.app_utils import Bridge

        payload = Bridge.call(
            "easy302/sniff",
            BAUDRATE,
            FRAMING,
            CAPTURE_MS,
            timeout=3,
        )
        return parse_bridge_payload(payload)

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
            table = "HR" if function == 3 else "IR"
            for index in range(count):
                pos = 3 + index * 2
                word = (frame[pos] << 8) | frame[pos + 1]
                register = address + index
                tag_id = f"NATIVE_S{slave}_{table}_{register:05d}"
                register_table = "hreg" if function == 3 else "ireg"
                channel_ref = f"modbus:slave{slave}:{register_table}:{register}"
                self._seq += 1
                observation = {
                    "tag_id": tag_id,
                    "asset_id": f"MODBUS-S{slave}",
                    "value": float(word),
                    "unit": "raw_word",
                    "quality": "GOOD",
                    "timestamp": now,
                    "source": "modbus_rtu",
                    "seq": self._seq,
                    "gateway_id": GATEWAY_ID,
                }
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

    def _publish(self, frames: list[dict[str, Any]]) -> int:
        if not frames:
            return 0
        token = os.environ.get("GATEWAY_INGEST_TOKEN", "change-me")
        request = urllib.request.Request(
            "http://127.0.0.1:8000/api/ingest/frame/batch",
            data=json.dumps(frames).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=4) as response:
            body = json.loads(response.read().decode("utf-8"))
        return int(body.get("accepted", 0))

    def _run(self) -> None:
        # Let Uvicorn bind before the first local ingest POST.
        self._stop.wait(1.5)
        while not self._stop.is_set():
            try:
                raw = self._capture_once()
                frames = scan_rtu_frames(raw)
                with self._lock:
                    self._last_capture_ts = _utc_now()
                    if raw:
                        self._last_data_ts = self._last_capture_ts
                        self._last_data_monotonic = time.monotonic()
                    self._bytes_seen += len(raw)
                    self._valid_frames += len(frames)
                    tag_frames = self._decode(frames)
                accepted = self._publish(tag_frames)
                with self._lock:
                    self._ingest_accepted += accepted
                    self._last_error = None
            except Exception as exc:  # Keep acquisition alive and surface exact status.
                with self._lock:
                    self._last_error = f"{type(exc).__name__}: {exc}"
                self._stop.wait(0.25)

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
                "poll_hz": 1000 / CAPTURE_MS,
                "last_poll_ts": self._last_capture_ts,
                "last_data_ts": self._last_data_ts,
                "ok_count": self._response_frames,
                "error_count": 0 if self._last_error is None else 1,
                "last_error": self._last_error,
                "started_at": self._started_at,
                "bytes_seen": self._bytes_seen,
                "valid_frames": self._valid_frames,
                "request_frames": self._request_frames,
                "response_frames": self._response_frames,
                "register_updates": self._register_updates,
                "ingest_accepted": self._ingest_accepted,
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
                "responding": True,
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
