"""WebSocket live stream — canonical/Situation deltas (Domain W).

Pushes only deltas; REST handles cold reads. Don't duplicate state logic.
"""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..pipeline.orchestrator import get_orchestrator

router = APIRouter()


@router.websocket("/stream")
async def stream(ws: WebSocket) -> None:
    await ws.accept()
    orch = get_orchestrator()
    try:
        while True:
            res = await orch.tick()
            await ws.send_text(json.dumps({
                "ts": res.ts,
                "degraded": res.degraded,
                "values": [v.model_dump() for v in res.values],
                "situations": [s.__dict__ for s in res.situations],
            }, default=str))
            await asyncio.sleep(1.0)
    except WebSocketDisconnect:
        return
