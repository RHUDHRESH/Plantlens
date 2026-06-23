"""Raw serial line reader for simple COM devices.

This is a gateway-only adapter. It decodes text from a serial port into the same
TagFrame contract as Modbus and does not evaluate alarms or root cause.
"""

from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Awaitable, Callable

import serial
import structlog

from gateway.tag_frame import TagFrame

log = structlog.get_logger()

PublishFn = Callable[[TagFrame], Awaitable[None]]
PAIR_RE = re.compile(r"^\s*([A-Z0-9_]+)\s*[:=,]\s*([-+]?\d+(?:\.\d+)?|true|false|null)\s*$", re.I)


@dataclass(frozen=True, slots=True)
class LineTagSpec:
    tag_id: str
    asset_id: str
    unit: str


def build_line_tag_index(tag_map: dict[str, Any]) -> dict[str, LineTagSpec]:
    """Index tag metadata from the contract tag map."""
    out: dict[str, LineTagSpec] = {}
    for entry in tag_map.get("tags", []):
        tag_id = str(entry.get("tag", ""))
        if not tag_id:
            continue
        out[tag_id] = LineTagSpec(
            tag_id=tag_id,
            asset_id=str(entry.get("asset_id", "UNKNOWN")),
            unit=str(entry.get("unit", "")),
        )
    return out


def _coerce_value(raw: str) -> float | bool | None | str:
    value = raw.strip()
    lower = value.lower()
    if lower == "true":
        return True
    if lower == "false":
        return False
    if lower == "null":
        return None
    try:
        return float(value)
    except ValueError:
        return value


def _frame_from_parts(
    *,
    tag_id: str,
    value: float | bool | None | str,
    tag_index: dict[str, LineTagSpec],
    default_tag_id: str,
    gateway_id: str,
    seq: int,
    now: datetime,
) -> TagFrame | None:
    spec = tag_index.get(tag_id) or tag_index.get(default_tag_id)
    if spec is None:
        return None
    resolved_tag_id = tag_id if tag_id in tag_index else spec.tag_id
    return TagFrame(
        tag_id=resolved_tag_id,
        asset_id=spec.asset_id,
        value=value,
        unit=spec.unit,
        quality="GOOD",
        timestamp=now,
        source="modbus_rtu",
        seq=seq,
        gateway_id=gateway_id,
    )


def parse_line_to_frames(
    line: str,
    *,
    tag_index: dict[str, LineTagSpec],
    default_tag_id: str,
    gateway_id: str,
    first_seq: int,
    now: datetime | None = None,
) -> list[TagFrame]:
    """Parse common serial text formats into TagFrames.

    Supported inputs:
    - Full TagFrame JSON object.
    - JSON object of tag/value pairs, e.g. {"MOTOR_301_CURRENT": 42.1}.
    - TAG=value, TAG:value, or TAG,value.
    - Multiple comma-separated pairs, e.g. MOTOR_301_CURRENT=42,BUS_101_V=47.
    - Bare numeric value, mapped to LINE_DEFAULT_TAG_ID.
    """
    text = line.strip()
    if not text:
        return []
    emitted_at = now or datetime.now(UTC)

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        parsed = None

    if isinstance(parsed, dict):
        if {"tag_id", "asset_id", "value", "unit", "quality", "timestamp", "source"} <= set(parsed):
            return [TagFrame.model_validate(parsed)]
        frames: list[TagFrame] = []
        seq = first_seq
        for key, value in parsed.items():
            frame = _frame_from_parts(
                tag_id=str(key),
                value=value,
                tag_index=tag_index,
                default_tag_id=default_tag_id,
                gateway_id=gateway_id,
                seq=seq,
                now=emitted_at,
            )
            if frame:
                frames.append(frame)
                seq += 1
        return frames

    tokens = [text]
    if "," in text and "=" in text:
        tokens = [part.strip() for part in text.split(",") if part.strip()]

    frames = []
    seq = first_seq
    for token in tokens:
        match = PAIR_RE.match(token)
        if match:
            frame = _frame_from_parts(
                tag_id=match.group(1).upper(),
                value=_coerce_value(match.group(2)),
                tag_index=tag_index,
                default_tag_id=default_tag_id,
                gateway_id=gateway_id,
                seq=seq,
                now=emitted_at,
            )
            if frame:
                frames.append(frame)
                seq += 1
            continue
        value = _coerce_value(token)
        if isinstance(value, (float, bool)) or value is None:
            frame = _frame_from_parts(
                tag_id=default_tag_id,
                value=value,
                tag_index=tag_index,
                default_tag_id=default_tag_id,
                gateway_id=gateway_id,
                seq=seq,
                now=emitted_at,
            )
            if frame:
                frames.append(frame)
                seq += 1
    return frames


class RawSerialLineReader:
    """Read newline-delimited serial values and publish TagFrames."""

    def __init__(
        self,
        *,
        port: str,
        baudrate: int,
        tag_index: dict[str, LineTagSpec],
        default_tag_id: str,
        gateway_id: str,
        publish: PublishFn,
    ) -> None:
        self._port = port
        self._baudrate = baudrate
        self._tag_index = tag_index
        self._default_tag_id = default_tag_id
        self._gateway_id = gateway_id
        self._publish = publish
        self._seq = 0

    async def run_forever(self) -> None:
        while True:
            try:
                await self._read_until_error()
            except Exception as exc:
                log.warning("raw_serial_reader_error", port=self._port, error=str(exc))
                await asyncio.sleep(2.0)

    async def _read_until_error(self) -> None:
        with serial.Serial(self._port, self._baudrate, timeout=1.0) as ser:
            log.info("raw_serial_reader_connected", port=self._port, baudrate=self._baudrate)
            while True:
                raw = await asyncio.to_thread(ser.readline)
                if not raw:
                    continue
                line = raw.decode("utf-8", errors="replace").strip()
                frames = parse_line_to_frames(
                    line,
                    tag_index=self._tag_index,
                    default_tag_id=self._default_tag_id,
                    gateway_id=self._gateway_id,
                    first_seq=self._seq + 1,
                )
                self._seq += len(frames)
                for frame in frames:
                    await self._publish(frame)
