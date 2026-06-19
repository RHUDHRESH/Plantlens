"""WebSocket fan-out for runtime frames and snapshots."""

from __future__ import annotations

import json
from typing import Any

from fastapi import WebSocket


class WebSocketHub:
    """Broadcast runtime messages to connected clients."""

    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._clients.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self._clients.discard(websocket)

    @property
    def client_count(self) -> int:
        return len(self._clients)

    async def broadcast(self, message: dict[str, Any]) -> None:
        payload = json.dumps(message, separators=(",", ":"), default=str)
        dead: list[WebSocket] = []
        for client in list(self._clients):
            try:
                await client.send_text(payload)
            except Exception:
                dead.append(client)
        for client in dead:
            self.disconnect(client)

    async def send_to(self, websocket: WebSocket, message: dict[str, Any]) -> None:
        await websocket.send_text(
            json.dumps(message, separators=(",", ":"), default=str)
        )


websocket_hub = WebSocketHub()