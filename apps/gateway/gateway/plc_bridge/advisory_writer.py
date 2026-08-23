"""Write advisory registers on Situation change only — never coils.

When a Modbus client is provided, allowlisted holding registers are written via
FC06 (single) or FC16 (multi). Without a client, values stay in-memory only.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Protocol

from gateway.register_codec import encode
from gateway.plc_bridge.diagnosis_encoder import encode_situation

_MAP_PATH = Path(__file__).with_name("plc_output_map.json")

FORBIDDEN_REGISTER_TYPES = frozenset({"coil", "discrete_output", "discrete"})


class ModbusWriteClient(Protocol):
    """Minimal write surface used by AdvisoryWriter (sync or awaitable)."""

    def write_register(
        self,
        address: int,
        value: int,
        *,
        device_id: int = 1,
    ) -> Any: ...

    def write_registers(
        self,
        address: int,
        values: list[int],
        *,
        device_id: int = 1,
    ) -> Any: ...


def load_output_map() -> dict[str, list[dict[str, Any]]]:
    return json.loads(_MAP_PATH.read_text(encoding="utf-8"))


def _advisory_allowlist(output_map: dict[str, list[dict[str, Any]]]) -> dict[int, dict[str, Any]]:
    """Holding-register addresses PlantLens may write; coils are never allowlisted."""
    allow: dict[int, dict[str, Any]] = {}
    for entry in output_map.get("advisory", []):
        reg_type = str(entry.get("register_type", "holding")).lower()
        if reg_type in FORBIDDEN_REGISTER_TYPES:
            continue
        if reg_type not in {"holding", "holding_register", "hr"}:
            continue
        address = int(entry["address"])
        allow[address] = entry
    return allow


def _contiguous_runs(addresses: list[int]) -> list[tuple[int, int]]:
    """Return (start, length) runs for sorted unique addresses."""
    if not addresses:
        return []
    ordered = sorted(set(addresses))
    runs: list[tuple[int, int]] = []
    start = ordered[0]
    prev = ordered[0]
    for addr in ordered[1:]:
        if addr == prev + 1:
            prev = addr
            continue
        runs.append((start, prev - start + 1))
        start = addr
        prev = addr
    runs.append((start, prev - start + 1))
    return runs


class AdvisoryWriter:
    """Maps diagnosis to holding registers for PLC/HMI display."""

    def __init__(
        self,
        output_map: dict[str, list[dict[str, Any]]] | None = None,
        client: ModbusWriteClient | None = None,
        *,
        slave_id: int = 1,
    ) -> None:
        self._map = output_map or load_output_map()
        self._client = client
        self._slave_id = slave_id
        self._allowlist = _advisory_allowlist(self._map)
        self._last_situation_id: str | None = None
        self._registers: dict[int, int] = {}
        self._last_modbus_writes: list[tuple[str, int, list[int]]] = []

    @property
    def registers(self) -> dict[int, int]:
        return dict(self._registers)

    @property
    def allowlisted_addresses(self) -> frozenset[int]:
        return frozenset(self._allowlist)

    @property
    def last_modbus_writes(self) -> list[tuple[str, int, list[int]]]:
        """(fc, address, values) recorded on the last flush — for tests."""
        return list(self._last_modbus_writes)

    def update(self, situation: dict[str, Any] | None) -> bool:
        situation_id = situation.get("situation_id") if situation else None
        if situation_id == self._last_situation_id:
            return False
        self._last_situation_id = situation_id
        codes = encode_situation(situation)
        for entry in self._map.get("advisory", []):
            output_id = entry["output_id"]
            if output_id not in codes:
                continue
            reg_type = str(entry.get("register_type", "holding")).lower()
            if reg_type in FORBIDDEN_REGISTER_TYPES:
                continue
            value = codes[output_id]
            data_type = entry.get("data_type", "uint16")
            address = int(entry["address"])
            if address not in self._allowlist:
                continue
            words = encode(value, data_type)
            for offset, word in enumerate(words):
                target = address + offset
                # Multi-word encodings may only land on allowlisted holding addresses.
                if target not in self._allowlist:
                    break
                self._registers[target] = word & 0xFFFF
        self._flush_to_modbus()
        return True

    def _flush_to_modbus(self) -> None:
        self._last_modbus_writes = []
        if self._client is None:
            return
        pending = {
            addr: val
            for addr, val in self._registers.items()
            if addr in self._allowlist
        }
        if not pending:
            return
        for start, length in _contiguous_runs(list(pending)):
            values = [pending[start + i] for i in range(length)]
            if length == 1:
                self._client.write_register(
                    start, values[0], device_id=self._slave_id
                )
                self._last_modbus_writes.append(("FC06", start, values))
            else:
                self._client.write_registers(
                    start, values, device_id=self._slave_id
                )
                self._last_modbus_writes.append(("FC16", start, values))
