import struct
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal, Optional


@dataclass
class TagFrame:
    tag_id: str
    channel_ref: dict
    raw: list[int]
    value: Optional[float]
    unit: str
    quality: Literal['GOOD', 'BAD', 'UNCERTAIN']
    ts: str
    source: str


def decode_float32(registers: list[int], word_order: str = 'AB') -> Optional[float]:
    """Decode two 16-bit Modbus registers into a 32-bit float."""
    if len(registers) < 2:
        return None

    if word_order == 'AB':
        hi, lo = registers[0], registers[1]
    else:
        lo, hi = registers[0], registers[1]

    try:
        raw_bytes = struct.pack('>HH', hi, lo)
        value = struct.unpack('>f', raw_bytes)[0]

        if not (-1e9 < value < 1e9):
            return None

        return value
    except Exception:
        return None


def make_tag_frame(
    tag_def,
    raw_registers: list[int] | None,
    error: bool = False,
    stale: bool = False,
) -> TagFrame:
    """Build a TagFrame from raw Modbus data and tag definition."""
    ts = datetime.now(timezone.utc).isoformat()

    if error or raw_registers is None:
        return TagFrame(
            tag_id=tag_def.tag_id,
            channel_ref=tag_def.channel_ref,
            raw=[],
            value=None,
            unit=tag_def.unit,
            quality='BAD',
            ts=ts,
            source='modbus_rtu',
        )

    raw_float = decode_float32(raw_registers, tag_def.word_order)

    if raw_float is None:
        return TagFrame(
            tag_id=tag_def.tag_id,
            channel_ref=tag_def.channel_ref,
            raw=raw_registers,
            value=None,
            unit=tag_def.unit,
            quality='BAD',
            ts=ts,
            source='modbus_rtu',
        )

    eng_value = (raw_float * tag_def.scale) + tag_def.offset
    quality = 'UNCERTAIN' if stale else 'GOOD'

    return TagFrame(
        tag_id=tag_def.tag_id,
        channel_ref=tag_def.channel_ref,
        raw=raw_registers,
        value=round(eng_value, 3),
        unit=tag_def.unit,
        quality=quality,
        ts=ts,
        source='modbus_rtu',
    )


def frames_to_dict(frames: list[TagFrame] | dict[str, TagFrame]) -> dict:
    """Convert TagFrames to dict keyed by tag_id for WebSocket broadcast."""
    if isinstance(frames, dict):
        items = frames.values()
    else:
        items = frames

    return {
        f.tag_id: {
            'tag_id': f.tag_id,
            'value': f.value,
            'unit': f.unit,
            'quality': f.quality,
            'ts': f.ts,
            'raw': f.raw,
        }
        for f in items
    }