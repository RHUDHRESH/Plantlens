"""Gateway TagFrame ingest — read-only telemetry path (rule R3/R7)."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.runtime.simulator.simulator_gateway import get_simulator_gateway
from app.schemas.tag_frame import TagFrame
from app.services.observability import ingest_span, record_ingest_frame
from app.settings import Settings, get_settings

router = APIRouter(prefix="/api/ingest", tags=["ingest"])


async def verify_gateway_ingest_token(
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> None:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing gateway ingest token",
        )
    token = authorization.split(" ", 1)[1]
    if token != settings.gateway_ingest_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid gateway ingest token",
        )


async def _ingest_frames(frames: list[TagFrame]) -> dict[str, int | str]:
    gateway = get_simulator_gateway()
    accepted = 0
    for frame in frames:
        try:
            with ingest_span(frame.tag_id):
                await gateway.on_frame(frame)
            record_ingest_frame()
            accepted += 1
        except Exception:
            continue
    return {"status": "ok", "accepted": accepted, "total": len(frames)}


@router.post("/frame")
async def ingest_frame(
    frame: TagFrame,
    _: None = Depends(verify_gateway_ingest_token),
) -> dict[str, int | str]:
    now = datetime.now(UTC)
    stamped = frame.model_copy(update={"ingest_ts": now})
    return await _ingest_frames([stamped])


@router.post("/frame/batch")
async def ingest_frame_batch(
    frames: list[TagFrame],
    _: None = Depends(verify_gateway_ingest_token),
) -> dict[str, int | str]:
    now = datetime.now(UTC)
    stamped = [frame.model_copy(update={"ingest_ts": now}) for frame in frames]
    return await _ingest_frames(stamped)