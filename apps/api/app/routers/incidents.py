"""Incident Room routes — evidence-first escalation workflow."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_viewer
from app.auth.principal import Principal
from app.dependencies import get_db
from app.incidents.incident_room_service import (
    add_comment,
    build_incident_room,
    complete_checklist_item,
    create_incident_from_calm_card,
    update_status,
)
from app.incidents.incident_store import incident_store
from app.services.audit_chain import AuditChainService

router = APIRouter(prefix="/api/incidents", tags=["incidents"])
_audit = AuditChainService()


class EscalateRequest(BaseModel):
    calm_card: dict
    situation: dict
    raw_alarms: list[dict] = Field(default_factory=list)


class CommentRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class StatusRequest(BaseModel):
    status: str = Field(pattern=r"^(open|acknowledged|in_progress|resolved|closed)$")


class ChecklistRequest(BaseModel):
    item_id: str
    status: str = Field(default="done", pattern=r"^(pending|done|blocked)$")


@router.post("/escalate")
async def escalate_from_calm_card(
    body: EscalateRequest,
    principal: Principal = Depends(require_viewer),
    session: AsyncSession = Depends(get_db),
) -> dict:
    if not body.situation:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "missing_situation", "message": "Situation evidence is required"},
        )
    incident = create_incident_from_calm_card(
        body.calm_card,
        body.situation,
        actor=principal.subject,
        raw_alarms=body.raw_alarms,
    )
    now = datetime.now(UTC)
    record = await _audit.append(
        session,
        audit_id=str(uuid.uuid4()),
        ts=now.isoformat().replace("+00:00", "Z"),
        actor_type=principal.actor_type,
        actor_id=principal.subject,
        actor_role=principal.role,
        action="incident.create",
        entity_type="incident",
        entity_id=incident["incident_id"],
        after={"incident_id": incident["incident_id"], "title": incident["title"]},
    )
    await session.commit()
    return {"incident": incident, "audit_id": record.audit_id}


@router.get("/{incident_id}")
async def get_incident_room(
    incident_id: str,
    _principal: Principal = Depends(require_viewer),
) -> dict:
    room = build_incident_room(incident_id)
    if room is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "incident_not_found", "message": f"Incident {incident_id} not found"},
        )
    return room


@router.post("/{incident_id}/comments")
async def post_comment(
    incident_id: str,
    body: CommentRequest,
    principal: Principal = Depends(require_viewer),
    session: AsyncSession = Depends(get_db),
) -> dict:
    try:
        incident = add_comment(incident_id, actor=principal.subject, message=body.message)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    now = datetime.now(UTC)
    record = await _audit.append(
        session,
        audit_id=str(uuid.uuid4()),
        ts=now.isoformat().replace("+00:00", "Z"),
        actor_type=principal.actor_type,
        actor_id=principal.subject,
        actor_role=principal.role,
        action="incident.comment",
        entity_type="incident",
        entity_id=incident_id,
        after={"message": body.message},
    )
    await session.commit()
    return {"incident": incident, "audit_id": record.audit_id}


@router.post("/{incident_id}/status")
async def post_status(
    incident_id: str,
    body: StatusRequest,
    principal: Principal = Depends(require_viewer),
    session: AsyncSession = Depends(get_db),
) -> dict:
    try:
        incident = update_status(incident_id, actor=principal.subject, status=body.status)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    now = datetime.now(UTC)
    record = await _audit.append(
        session,
        audit_id=str(uuid.uuid4()),
        ts=now.isoformat().replace("+00:00", "Z"),
        actor_type=principal.actor_type,
        actor_id=principal.subject,
        actor_role=principal.role,
        action="incident.status",
        entity_type="incident",
        entity_id=incident_id,
        after={"status": body.status},
    )
    await session.commit()
    return {"incident": incident, "audit_id": record.audit_id}


@router.post("/{incident_id}/checklist")
async def post_checklist(
    incident_id: str,
    body: ChecklistRequest,
    principal: Principal = Depends(require_viewer),
    session: AsyncSession = Depends(get_db),
) -> dict:
    try:
        incident = complete_checklist_item(
            incident_id,
            item_id=body.item_id,
            actor=principal.subject,
            status=body.status,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    now = datetime.now(UTC)
    record = await _audit.append(
        session,
        audit_id=str(uuid.uuid4()),
        ts=now.isoformat().replace("+00:00", "Z"),
        actor_type=principal.actor_type,
        actor_id=principal.subject,
        actor_role=principal.role,
        action="incident.checklist",
        entity_type="incident",
        entity_id=incident_id,
        after={"item_id": body.item_id, "status": body.status},
    )
    await session.commit()
    return {"incident": incident, "audit_id": record.audit_id}


@router.get("")
async def list_incidents(_principal: Principal = Depends(require_viewer)) -> dict:
    return {"incident_ids": incident_store.list_ids()}