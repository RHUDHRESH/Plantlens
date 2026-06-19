"""Action request handshake — request registers only, PLC decides."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from gateway.register_codec import encode


@dataclass
class ActionRequest:
    request_id: int
    action_code: int
    target_asset_code: int
    ttl_seconds: int = 30
    operator_confirmation_code: int = 0


@dataclass
class ActionRequestWriter:
    """Writes action request block; ACTION_REQUEST_ACTIVE last to avoid half-written requests."""

    _next_id: int = 1
    _pending: ActionRequest | None = None
    _registers: dict[int, int] = field(default_factory=dict)

    @property
    def registers(self) -> dict[int, int]:
        return dict(self._registers)

    def submit(self, request: ActionRequest, output_map: dict[str, list[dict[str, Any]]]) -> dict[int, int]:
        self._pending = request
        entries = {e["output_id"]: e for e in output_map.get("action_request", [])}
        writes: dict[int, int] = {}
        for output_id, value in (
            ("ACTION_REQUEST_ID", request.request_id),
            ("ACTION_CODE", request.action_code),
            ("TARGET_ASSET_CODE", request.target_asset_code),
            ("REQUEST_TTL_SECONDS", request.ttl_seconds),
            ("OPERATOR_CONFIRMATION_CODE", request.operator_confirmation_code),
        ):
            entry = entries.get(output_id)
            if not entry:
                continue
            words = encode(value, entry.get("data_type", "uint16"))
            address = int(entry["address"])
            for offset, word in enumerate(words):
                writes[address + offset] = word & 0xFFFF
        active = entries.get("ACTION_REQUEST_ACTIVE")
        if active:
            words = encode(1, active.get("data_type", "uint16"))
            address = int(active["address"])
            for offset, word in enumerate(words):
                writes[address + offset] = word & 0xFFFF
        self._registers = writes
        self._next_id += 1
        return writes