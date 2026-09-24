"""Studio editor state that is NOT runtime truth (layout positions, viewport).

Node positions are a projection concern (R4): saving them never touches the causal graph,
alarm rules or the runtime. Stored as versioned ``authored_config_document`` rows.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_engineer, require_viewer
from app.auth.principal import Principal
from app.db.models.authored import AuthoredConfigDocument
from app.dependencies import get_db

router = APIRouter(prefix="/api/studio", tags=["studio"])

LAYOUT_DOC = "studio_layout"
MAX_NODES = 5_000


class NodePosition(BaseModel):
    x: float = Field(ge=-1e6, le=1e6)
    y: float = Field(ge=-1e6, le=1e6)


class LayoutBody(BaseModel):
    positions: dict[str, NodePosition] = Field(default_factory=dict)
    viewport: dict[str, float] | None = None
    base_revision: int | None = Field(
        default=None, description="Revision the client edited; a mismatch returns 409 (no lost updates)."
    )


async def _latest(session: AsyncSession, plant_id: str) -> AuthoredConfigDocument | None:
    stmt = select(AuthoredConfigDocument).where(
        AuthoredConfigDocument.plant_id == plant_id, AuthoredConfigDocument.doc_type == LAYOUT_DOC
    )
    rows = list((await session.execute(stmt)).scalars())
    return max(rows, key=lambda r: int(r.revision)) if rows else None


@router.get("/layout/{plant_id}")
async def get_layout(
    plant_id: str,
    _principal: Principal = Depends(require_viewer),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    row = await _latest(session, plant_id)
    if row is None:
        return {"plant_id": plant_id, "revision": 0, "positions": {}, "viewport": None}
    return {"plant_id": plant_id, "revision": int(row.revision), **row.payload_json}


@router.put("/layout/{plant_id}")
async def put_layout(
    plant_id: str,
    body: LayoutBody,
    _principal: Principal = Depends(require_engineer),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    if len(body.positions) > MAX_NODES:
        raise HTTPException(status_code=413, detail=f"At most {MAX_NODES} node positions")
    row = await _latest(session, plant_id)
    current = int(row.revision) if row else 0
    if body.base_revision is not None and body.base_revision != current:
        raise HTTPException(
            status_code=409,
            detail={"message": "Layout changed since you loaded it", "current_revision": current},
        )
    payload = {
        "positions": {k: v.model_dump() for k, v in body.positions.items()},
        "viewport": body.viewport,
    }
    session.add(
        AuthoredConfigDocument(plant_id=plant_id, doc_type=LAYOUT_DOC, revision=str(current + 1), payload_json=payload)
    )
    await session.commit()
    return {"plant_id": plant_id, "revision": current + 1, **payload}
