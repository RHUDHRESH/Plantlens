"""WebSocket fan-out for runtime frames and snapshots."""

from __future__ import annotations

import asyncio
from typing import Any

import orjson
import structlog
from fastapi import WebSocket

log = structlog.get_logger(__name__)

# A client that cannot take a message within this budget is dropped rather than
# allowed to delay every other operator screen.
DEFAULT_SEND_TIMEOUT_S = 1.0


def encode_message(message: dict[str, Any]) -> str:
    return orjson.dumps(message, default=str, option=orjson.OPT_NON_STR_KEYS).decode("utf-8")


class WebSocketHub:
    """Broadcast runtime messages to connected clients."""

    def __init__(self, *, send_timeout_s: float = DEFAULT_SEND_TIMEOUT_S) -> None:
        self._clients: set[WebSocket] = set()
        self._send_timeout_s = send_timeout_s

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._clients.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self._clients.discard(websocket)

    @property
    def client_count(self) -> int:
        return len(self._clients)

    async def _send(self, client: WebSocket, payload: str) -> bool:
        try:
            await asyncio.wait_for(client.send_text(payload), timeout=self._send_timeout_s)
            return True
        except Exception as exc:  # noqa: BLE001 — any send failure drops the client
            log.info("ws_client_dropped", reason=type(exc).__name__)
            return False

    async def broadcast(self, message: dict[str, Any]) -> None:
        """Encode once, send to all clients concurrently, drop slow or dead ones."""
        clients = list(self._clients)
        if not clients:
            return
        payload = encode_message(message)
        results = await asyncio.gather(*(self._send(client, payload) for client in clients))
        for client, ok in zip(clients, results, strict=True):
            if not ok:
                self.disconnect(client)

    async def send_to(self, websocket: WebSocket, message: dict[str, Any]) -> None:
        await websocket.send_text(encode_message(message))


websocket_hub = WebSocketHub()
