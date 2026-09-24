"""Compatibility facade for the line-mode reader.

The implementation lives in :mod:`gateway.line` (framer, protocols, reader) and
:mod:`gateway.transport` (discovery, serial link). This module keeps the historical entry points:

* ``build_line_tag_index(tag_map)``
* ``parse_line_to_frames(line, ...)`` — one-shot parse used by ``gateway.diagnostics --line``
* ``RawSerialLineReader`` — thin wrapper that wires SerialLink + LineReader

Behaviour changes versus the original reader (intentional, see README):
unknown keys are rejected and counted instead of being remapped to the default tag; NaN/Inf
become BAD; frames are stamped with the configured line ``source`` (default ``serial_line``) rather
than ``modbus_rtu``.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from gateway.line.protocols import LineDecoder, LineTagSpec
from gateway.line.reader import LineReader, PublishFn, readings_to_frames
from gateway.tag_frame import TagFrame, TagSource
from gateway.transport.serial_link import LinkConfig, ResetPolicy, SerialLink

__all__ = [
    "LineTagSpec",
    "RawSerialLineReader",
    "build_line_tag_index",
    "parse_line_to_frames",
]


def build_line_tag_index(tag_map: dict[str, Any], *, stale_after_ms: int | None = None) -> dict[str, LineTagSpec]:
    """Index tag metadata from the contract tag map."""
    out: dict[str, LineTagSpec] = {}
    for entry in tag_map.get("tags", []):
        tag_id = str(entry.get("tag", ""))
        if not tag_id:
            continue
        stale = stale_after_ms or int(entry.get("quality_policy", {}).get("stale_after_ms", 2000))
        out[tag_id] = LineTagSpec(
            tag_id=tag_id,
            asset_id=str(entry.get("asset_id", "UNKNOWN")),
            unit=str(entry.get("unit", "")),
            stale_after_ms=stale,
        )
    return out


def parse_line_to_frames(
    line: str,
    *,
    tag_index: dict[str, LineTagSpec],
    default_tag_id: str | None,
    gateway_id: str,
    first_seq: int,
    now: datetime | None = None,
    source: TagSource = "serial_line",
    decoder: LineDecoder | None = None,
) -> list[TagFrame]:
    """Parse one line (stateless unless a *decoder* is passed). Never raises."""
    dec = decoder or LineDecoder(tag_index, default_tag_id=default_tag_id)
    readings = dec.decode(line)
    return readings_to_frames(
        readings,
        tag_index=tag_index,
        gateway_id=gateway_id,
        source=source,
        first_seq=first_seq,
        now=now or datetime.now(UTC),
    )


class RawSerialLineReader:
    """Legacy constructor signature; delegates to :class:`gateway.line.reader.LineReader`."""

    def __init__(
        self,
        *,
        port: str | None,
        baudrate: int,
        tag_index: dict[str, LineTagSpec],
        default_tag_id: str | None,
        gateway_id: str,
        publish: PublishFn,
        reset_policy: ResetPolicy | str = ResetPolicy.WAIT_FOR_RESET,
        source: TagSource = "serial_line",
    ) -> None:
        self.link = SerialLink(LinkConfig(selector=port, baudrate=baudrate, reset_policy=reset_policy, name="line"))
        self.reader = LineReader(
            link=self.link,
            decoder=LineDecoder(tag_index, default_tag_id=default_tag_id),
            gateway_id=gateway_id,
            publish=publish,
            source=source,
        )

    async def run_forever(self) -> None:
        try:
            await self.reader.run_forever()
        finally:
            await self.link.stop()
