"""Runtime snapshot, alarm ack/shelve, trends and causal-graph projection routes."""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_human_approver, require_viewer
from app.auth.principal import Principal
from app.dependencies import get_db
from app.runtime.alarm_engine import acknowledge_alarm, list_shelved, shelve_alarm, unshelve_alarm
from app.runtime.causal.structure import structure_for
from app.runtime.config_loader import get_runtime_config
from app.runtime.runtime_state import runtime_state
from app.services.audit_chain import AuditChainService

router = APIRouter(prefix="/api/runtime", tags=["runtime"])
_audit = AuditChainService()


@router.get("/snapshot")
async def get_runtime_snapshot(
    _principal: Principal = Depends(require_viewer),
) -> dict:
    return runtime_state.snapshot()


@router.post("/alarms/{alarm_id}/ack")
async def ack_alarm(
    alarm_id: str,
    principal: Principal = Depends(require_human_approver),
    session: AsyncSession = Depends(get_db),
) -> dict:
    if alarm_id not in runtime_state.active_alarms:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "alarm_not_found",
                "message": f"Alarm {alarm_id} is not active",
                "fix": "Refresh the alarm list and ack only active alarms.",
            },
        )
    acknowledge_alarm(runtime_state, alarm_id)
    now = datetime.now(UTC)
    record = await _audit.append(
        session,
        audit_id=str(uuid.uuid4()),
        ts=now.isoformat().replace("+00:00", "Z"),
        actor_type=principal.actor_type,
        actor_id=principal.subject,
        actor_role=principal.role,
        action="alarm.ack",
        entity_type="alarm",
        entity_id=alarm_id,
        after={"alarm_id": alarm_id, "acked": True},
    )
    await session.commit()
    return {
        "status": "ok",
        "alarm_id": alarm_id,
        "audit_id": record.audit_id,
    }


# Shelving limits: long enough for a maintenance task, short enough that nothing is forgotten.
MIN_SHELVE_S = 60
MAX_SHELVE_S = 8 * 3600


class ShelveRequest(BaseModel):
    duration_s: int = Field(ge=MIN_SHELVE_S, le=MAX_SHELVE_S)
    reason: str = Field(min_length=3, max_length=500)


def _runtime_now() -> datetime:
    return runtime_state.clock_now() or datetime.now(UTC)


async def _audit_alarm(session: AsyncSession, principal: Principal, action: str, alarm_id: str, after: dict,
                       reason: str | None = None) -> str:
    record = await _audit.append(
        session,
        audit_id=str(uuid.uuid4()),
        ts=datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        actor_type=principal.actor_type,
        actor_id=principal.subject,
        actor_role=principal.role,
        action=action,
        entity_type="alarm",
        entity_id=alarm_id,
        after=after,
        reason=reason,
    )
    await session.commit()
    return record.audit_id


@router.post("/alarms/{alarm_id}/shelve")
async def shelve(
    alarm_id: str,
    body: ShelveRequest,
    principal: Principal = Depends(require_human_approver),
    session: AsyncSession = Depends(get_db),
) -> dict:
    if not any(rule.id == alarm_id for rule in get_runtime_config().alarm_rules):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown alarm {alarm_id}")
    now = _runtime_now()
    until = now + timedelta(seconds=body.duration_s)
    shelve_alarm(alarm_id, until=until, reason=body.reason, by=principal.subject, now=now)
    audit_id = await _audit_alarm(
        session, principal, "alarm.shelve", alarm_id,
        {"alarm_id": alarm_id, "until": until.isoformat().replace("+00:00", "Z")}, body.reason,
    )
    return {"status": "ok", "alarm_id": alarm_id, "until": until.isoformat().replace("+00:00", "Z"),
            "audit_id": audit_id}


@router.post("/alarms/{alarm_id}/unshelve")
async def unshelve(
    alarm_id: str,
    principal: Principal = Depends(require_human_approver),
    session: AsyncSession = Depends(get_db),
) -> dict:
    if not unshelve_alarm(alarm_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Alarm {alarm_id} is not shelved")
    audit_id = await _audit_alarm(session, principal, "alarm.unshelve", alarm_id, {"alarm_id": alarm_id})
    return {"status": "ok", "alarm_id": alarm_id, "audit_id": audit_id}


@router.get("/alarms/shelved")
async def shelved(_principal: Principal = Depends(require_viewer)) -> dict:
    return {"shelved": list_shelved(_runtime_now())}


@router.get("/alarm-rules")
async def alarm_rules(_principal: Principal = Depends(require_viewer)) -> dict:
    """Configured alarm rules (limits for trend overlays and the alarm catalogue)."""
    return {"rules": [rule.model_dump(mode="json") for rule in get_runtime_config().alarm_rules]}


@router.get("/trends")
async def trends(
    tag_ids: str = Query(..., description="Comma-separated tag ids"),
    seconds: int = Query(default=900, ge=10, le=24 * 3600),
    _principal: Principal = Depends(require_viewer),
) -> dict:
    ids = [t for t in (part.strip() for part in tag_ids.split(",")) if t][:12]
    now = _runtime_now()
    since = now - timedelta(seconds=seconds)
    tag_index = get_runtime_config().tag_index
    return {
        "now": now.isoformat().replace("+00:00", "Z"),
        "series": [
            {
                "tag_id": tag_id,
                "unit": tag_index.get(tag_id, {}).get("unit"),
                "asset_id": tag_index.get(tag_id, {}).get("asset_id"),
                "points": runtime_state.tag_history(tag_id, since=since),
            }
            for tag_id in ids
        ],
    }


@router.get("/causal-graph")
async def causal_graph(_principal: Principal = Depends(require_viewer)) -> dict:
    """Approved + draft causal structure with live highlight (read-only projection)."""
    config = get_runtime_config()
    gi = config.graph_index
    structure = structure_for(gi)
    situation = next(iter(runtime_state.active_situations.values()), None)
    alarmed_assets = sorted({a.get("asset_id") for a in runtime_state.active_alarms.values() if a.get("asset_id")})
    return {
        "graph_id": gi.get("graph_id"),
        "bundle_rev": config.bundle_rev,
        "nodes": [
            {
                "id": node_id,
                "label": node.get("label") or config.asset_index.get(node_id, {}).get("display_name", node_id),
                "asset_type": config.asset_index.get(node_id, {}).get("type"),
                "evidence_tags": node.get("evidence_tags", []),
                "status": runtime_state.asset_status.get(node_id, "normal"),
            }
            for node_id, node in sorted(gi.get("nodes", {}).items())
        ],
        "edges": [
            {
                "id": e["id"], "from": e["from"], "to": e["to"], "approved": bool(e.get("approved")),
                "edge_type": e.get("edge_type"), "lag_ms": e.get("lag_ms"), "polarity": e.get("polarity", "any"),
                "loop_ok": bool(e.get("loop_ok")), "loop_id": e.get("loop_id"), "provenance": e.get("provenance"),
            }
            for e in sorted(gi.get("edges_by_id", {}).values(), key=lambda e: e["id"])
        ],
        "feedback_loops": [
            list(structure.components[ci]) for ci in sorted(structure.cyclic_components)
        ],
        "highlight": {
            "root_asset_id": situation.get("root_asset_id") if situation else None,
            "traversed_edges": situation.get("traversed_edges", []) if situation else [],
            "alarmed_assets": alarmed_assets,
        },
    }
