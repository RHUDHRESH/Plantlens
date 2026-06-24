"""Modbus RTU/TCP adapter (Domain C) — pymodbus 3.6.9.

READ-ONLY. Uses read_input_registers(address, count=N, slave=ID) (FC04).
Gotcha (per pymodbus 3.6.9 docs): the legacy `unit=` keyword is GONE in 4.0;
use `slave=`. Decode float32 across a register pair with
`client.convert_from_registers(regs, client.DATATYPE.FLOAT32)` — the 3.6.x
helper handles byte order but NOT word-order swapping; validate against a
known reference value during bring-up.

Production swap: replace this file with opcua_adapter.py; nothing above
sources/ changes.
"""
from __future__ import annotations

import json

from ..config import MODELS_DIR
from ..schemas.canonical import CanonicalValue
from .base import SourceAdapter


class ModbusAdapter(SourceAdapter):
    id = "modbus"

    def __init__(self, address_map: str = "address_map.json", host: str = "127.0.0.1",
                 port: int = 502, slave: int = 1) -> None:
        self.host = host
        self.port = port
        self.slave = slave
        self.map = json.loads((MODELS_DIR / address_map).read_text(encoding="utf-8"))
        self._client = None  # lazy: from pymodbus.client import ModbusTcpClient

    async def read(self) -> list[CanonicalValue]:
        # Scaffold: real reads require pymodbus client wiring. Returns empty until wired.
        # Planned: client.read_input_registers(addr, count=N, slave=self.slave)
        #          -> client.convert_from_registers(regs, client.DATATYPE.FLOAT32)
        return []
