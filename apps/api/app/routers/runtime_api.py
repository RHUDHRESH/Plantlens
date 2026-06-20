"""Runtime snapshot and alarm ack routes."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_human_approver, require_viewer
from app.auth.principal import Principal
from app.dependencies import get_db
from app.runtime.alarm_engine import acknowledge_alarm
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
