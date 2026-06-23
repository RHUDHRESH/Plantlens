"""Modbus register decode/encode — fail closed on short reads."""

from __future__ import annotations

import struct
from typing import overload


class CodecError(ValueError):
    """Register slice cannot be decoded."""


def _scaled_number(raw: int, *, scale: float, offset: float) -> int | float:
    value = raw * scale + offset
    if scale == 1.0 and offset == 0.0:
        return int(value)
    return float(value)


def _require_length(registers: list[int], words: int, codec: str) -> None:
    if len(registers) < words:
        msg = f"codec {codec} needs {words} register(s), got {len(registers)}"
        raise CodecError(msg)


def decode(
    registers: list[int],
    codec: str,
    *,
    scale: float = 1.0,
    offset: float = 0.0,
) -> float | int | bool:
    """Decode raw registers to engineering value."""
    if codec == "uint16":
        _require_length(registers, 1, codec)
        raw = registers[0] & 0xFFFF
        return _scaled_number(raw, scale=scale, offset=offset)
    if codec == "int16":
        _require_length(registers, 1, codec)
        raw = registers[0]
        if raw > 0x7FFF:
            raw -= 0x10000
        return _scaled_number(raw, scale=scale, offset=offset)
    if codec == "uint32_be":
        _require_length(registers, 2, codec)
        raw = (registers[0] << 16) | (registers[1] & 0xFFFF)
        return _scaled_number(raw, scale=scale, offset=offset)
    if codec == "int32_be":
        _require_length(registers, 2, codec)
        packed = struct.pack(">HH", registers[0] & 0xFFFF, registers[1] & 0xFFFF)
        raw = struct.unpack(">i", packed)[0]
        return _scaled_number(raw, scale=scale, offset=offset)
    if codec == "float32_be":
        _require_length(registers, 2, codec)
        packed = struct.pack(">HH", registers[0] & 0xFFFF, registers[1] & 0xFFFF)
        raw = struct.unpack(">f", packed)[0]
        return float(raw * scale + offset)
    if codec == "float32_cdab":
        _require_length(registers, 2, codec)
        packed = struct.pack(">HH", registers[1] & 0xFFFF, registers[0] & 0xFFFF)
        raw = struct.unpack(">f", packed)[0]
        return float(raw * scale + offset)
    if codec == "float32_le":
        _require_length(registers, 2, codec)
        packed = struct.pack("<HH", registers[1] & 0xFFFF, registers[0] & 0xFFFF)
        raw = struct.unpack("<f", packed)[0]
        return float(raw * scale + offset)
    if codec == "bool":
        _require_length(registers, 1, codec)
        return bool(registers[0])
    msg = f"unsupported codec: {codec}"
    raise CodecError(msg)


@overload
def encode(value: bool, codec: str, *, scale: float = 1.0, offset: float = 0.0) -> list[int]: ...

@overload
def encode(value: int | float, codec: str, *, scale: float = 1.0, offset: float = 0.0) -> list[int]: ...


def encode(
    value: bool | int | float,
    codec: str,
    *,
    scale: float = 1.0,
    offset: float = 0.0,
) -> list[int]:
    """Encode value for PLC advisory writes."""
    if codec == "bool":
        return [1 if value else 0]
    if codec in {"uint16", "int16"}:
        raw = int(round((float(value) - offset) / scale)) if scale else int(value)
        return [raw & 0xFFFF]
    if codec == "float32_be":
        packed = struct.pack(">f", float(value))
        hi, lo = struct.unpack(">HH", packed)
        return [hi, lo]
    if codec == "uint32_be":
        raw = int(round((float(value) - offset) / scale)) if scale else int(value)
        return [(raw >> 16) & 0xFFFF, raw & 0xFFFF]
    msg = f"unsupported encode codec: {codec}"
    raise CodecError(msg)
