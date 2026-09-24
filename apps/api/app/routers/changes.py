"""Change pipeline API: submit drafts, review with a comment, deploy, roll back (R5/R6)."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_admin, require_change_approver, require_roles, require_viewer
from app.auth.principal import Principal
from app.changes import service
from app.changes.ops import ChangeSet
from app.dependencies import get_db

router = APIRouter(prefix="/api/changes", tags=["changes"])

# Proposers: engineers/admins author directly; agents may only draft (never review).
require_proposer = require_roles("engineer", "admin", "agent")


class ReviewRequest(BaseModel):
    decision: Literal["approve", "reject"]
    comment: str = Field(min_length=1, max_length=4000)
    approve_edges: bool = Field(
        default=True,
        description="Admit the edges this change adds/updates to the runtime (approved=true).",
    )


class RollbackRequest(BaseModel):
    to_rev: int = Field(ge=1)
    comment: str = Field(min_length=1, max_length=4000)


def _raise(exc: service.ChangePipelineError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.get("")
async def list_change_requests(
    status: str | None = None,
    _principal: Principal = Depends(require_viewer),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    rows = await service.list_changes(session, status)
    return {"changes": [service.serialize_change(r) for r in rows]}


@router.post("")
async def submit_change_request(
    change_set: ChangeSet,
    principal: Principal = Depends(require_proposer),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    if principal.is_agent and change_set.source != "agent":
        raise HTTPException(status_code=403, detail="Agents may only submit source='agent' drafts")
    row = await service.submit_change(session, change_set, principal)
    await session.commit()
    return {"change": service.serialize_change(row)}


@router.get("/active")
async def active_revision(
    _principal: Principal = Depends(require_viewer),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    latest = await service.latest_revision(session)
    return {
        "runtime": service.active_runtime_info(),
        "latest_revision": {
            "rev": latest.rev,
            "bundle_hash": latest.bundle_hash,
            "created_by": latest.created_by,
            "note": latest.note,
        }
        if latest
        else None,
    }


@router.get("/revisions")
async def list_revisions(
    _principal: Principal = Depends(require_viewer),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    from sqlalchemy import select

    from app.db.models.authored import BundleRevision

    rows = (await session.execute(select(BundleRevision).order_by(BundleRevision.rev.desc()))).scalars()
    return {
        "revisions": [
            {
                "rev": r.rev,
                "parent_rev": r.parent_rev,
                "bundle_hash": r.bundle_hash,
                "created_by": r.created_by,
                "source_change_id": r.source_change_id,
                "note": r.note,
                "deployed_at": r.deployed_at.isoformat() if r.deployed_at else None,
            }
            for r in rows
        ]
    }


@router.get("/{change_id}")
async def get_change_request(
    change_id: str,
    _principal: Principal = Depends(require_viewer),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    try:
        row = await service.get_change(session, change_id)
    except service.ChangePipelineError as exc:
        _raise(exc)
    return {"change": service.serialize_change(row)}


@router.post("/{change_id}/review")
async def review_change_request(
    change_id: str,
    body: ReviewRequest,
    principal: Principal = Depends(require_change_approver),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    try:
        row = await service.review_change(
            session,
            change_id,
            decision=body.decision,
            comment=body.comment,
            approve_edges=body.approve_edges,
            principal=principal,
        )
    except service.ChangePipelineError as exc:
        await session.commit()  # persist a 'stale' status transition and its audit entry
        _raise(exc)
    await session.commit()
    return {"change": service.serialize_change(row), "runtime": service.active_runtime_info()}


@router.post("/rollback")
async def rollback(
    body: RollbackRequest,
    principal: Principal = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    if principal.is_agent:
        raise HTTPException(status_code=403, detail="Agents cannot roll back")
    try:
        revision = await service.rollback_to(session, body.to_rev, comment=body.comment, principal=principal)
    except service.ChangePipelineError as exc:
        _raise(exc)
    await session.commit()
    return {"rev": revision.rev, "runtime": service.active_runtime_info()}
