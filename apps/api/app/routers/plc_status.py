"""PLC advisory bridge status for web status strip."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth.dependencies import require_viewer
from app.auth.principal import Principal
from app.runtime.runtime_state import runtime_state

router = APIRouter(prefix="/api/plc", tags=["plc"])

_plc_state: dict = {
    "comms_ok": True,
    "advisory_registers": {},
    "action_request_registers": {},
    "feedback": {
        "action_status": "none",
        "deny_reason": "none",
        "last_action_id": 0,
        "stale": False,
    },
}


def update_plc_snapshot(snapshot: dict) -> None:
    global _plc_state
    _plc_state = snapshot


@router.get("/status")
async def get_plc_status(_principal: Principal = Depends(require_viewer)) -> dict:
    situation = next(iter(runtime_state.active_situations.values()), None)
    return {
        **_plc_state,
        "active_situation_id": situation.get("situation_id") if situation else None,
        "advisory_only": True,
    }