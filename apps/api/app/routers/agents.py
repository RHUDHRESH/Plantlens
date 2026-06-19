"""Agent draft proxy + human approval gate (rule R5)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_human_approver, require_viewer
from app.auth.principal import Principal
from app.dependencies import get_db
from app.services.agent_queue import agent_draft_queue
from app.services.audit_chain import AuditChainService
from app.settings import Settings, get_settings

router = APIRouter(prefix="/api/agents", tags=["agents"])
_audit = AuditChainService()


class GraphDraftRequest(BaseModel):
    context: dict = Field(default_factory=dict)
    prompt: str = Field(default="", max_length=4000)


class DraftAction(BaseModel):
    draft_id: str


@router.post("/graph-draft")
async def request_graph_draft(
    body: GraphDraftRequest,
    principal: Principal = Depends(require_viewer),
    settings: Settings = Depends(get_settings),
) -> dict:
    payload = await _proxy_agents_service(
        settings,
        "/graph-draft",
        {"context": body.context, "prompt": body.prompt},
    )
    draft = agent_draft_queue.submit(
        draft_type="graph_draft",
        payload=payload,
        proposed_by=principal.subject,
    )
    return {"draft": draft}


@router.get("/drafts/pending")
async def list_pending_drafts(
    _principal: Principal = Depends(require_viewer),
) -> dict:
    return {"drafts": agent_draft_queue.list_pending()}


@router.post("/drafts/approve")
async def approve_draft(
    body: DraftAction,
    principal: Principal = Depends(require_human_approver),
    session: AsyncSession = Depends(get_db),
) -> dict:
    try:
        draft = agent_draft_queue.resolve(
            body.draft_id,
            status="approved",
            resolved_by=principal.subject,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    now = datetime.now(UTC)
    record = await _audit.append(
        session,
        audit_id=str(uuid.uuid4()),
        ts=now.isoformat().replace("+00:00", "Z"),
        actor_type=principal.actor_type,
        actor_id=principal.subject,
        actor_role=principal.role,
        action="agent.draft.approve",
        entity_type="agent_draft",
        entity_id=body.draft_id,
        after={"draft_type": draft["draft_type"], "status": "approved"},
    )
    await session.commit()
    return {"draft": draft, "audit_id": record.audit_id}


@router.post("/drafts/reject")
async def reject_draft(
    body: DraftAction,
    principal: Principal = Depends(require_human_approver),
    session: AsyncSession = Depends(get_db),
) -> dict:
    try:
        draft = agent_draft_queue.resolve(
            body.draft_id,
            status="rejected",
            resolved_by=principal.subject,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    now = datetime.now(UTC)
    record = await _audit.append(
        session,
        audit_id=str(uuid.uuid4()),
        ts=now.isoformat().replace("+00:00", "Z"),
        actor_type=principal.actor_type,
        actor_id=principal.subject,
        actor_role=principal.role,
        action="agent.draft.reject",
        entity_type="agent_draft",
        entity_id=body.draft_id,
        after={"draft_type": draft["draft_type"], "status": "rejected"},
    )
    await session.commit()
    return {"draft": draft, "audit_id": record.audit_id}


async def _proxy_agents_service(settings: Settings, path: str, body: dict) -> dict:
    url = f"{settings.agents_base_url.rstrip('/')}{path}"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(url, json=body)
            response.raise_for_status()
            return response.json()
    except Exception:
        return _local_stub_draft(body)


def _local_stub_draft(body: dict) -> dict:
    """Deterministic fallback when agents service is down — HMI unaffected."""
    return {
        "artifact_type": "graph_draft",
        "summary": "Proposed causal edge: MOTOR_301_CURRENT → BUS_101_V (draft only)",
        "proposed_changes": [
            {
                "change_type": "causal_edge",
                "from": "MOTOR_301_CURRENT",
                "to": "BUS_101_V",
                "note": body.get("prompt", "")[:200],
            }
        ],
        "requires_human_approval": True,
    }