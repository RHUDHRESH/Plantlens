"""Runtime WebSocket subscription."""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.runtime.websocket_hub import websocket_hub

router = APIRouter(tags=["websocket"])


@router.websocket("/api/ws/runtime")
async def runtime_ws(websocket: WebSocket) -> None:
    await websocket_hub.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        websocket_hub.disconnect(websocket)