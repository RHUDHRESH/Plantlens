"""Write advisory registers on Situation change only — never coils."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from gateway.register_codec import encode
from gateway.plc_bridge.diagnosis_encoder import encode_situation

_MAP_PATH = Path(__file__).with_name("plc_output_map.json")


def load_output_map() -> dict[str, list[dict[str, Any]]]:
    return json.loads(_MAP_PATH.read_text(encoding="utf-8"))


class AdvisoryWriter:
    """Maps diagnosis to holding registers for PLC/HMI display."""

    def __init__(self, output_map: dict[str, list[dict[str, Any]]] | None = None) -> None:
        self._map = output_map or load_output_map()
        self._last_situation_id: str | None = None
        self._registers: dict[int, int] = {}

    @property
    def registers(self) -> dict[int, int]:
        return dict(self._registers)

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
            value = codes[output_id]
            data_type = entry.get("data_type", "uint16")
            address = int(entry["address"])
            words = encode(value, data_type)
            for offset, word in enumerate(words):
                self._registers[address + offset] = word & 0xFFFF
        return True