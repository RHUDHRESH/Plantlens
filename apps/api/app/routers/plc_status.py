"""PLC advisory bridge status for web status strip."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth.dependencies import require_viewer
from app.auth.principal import Principal
from app.runtime.runtime_state import runtime_state

router = APIRouter(prefix="/api/plc", tags=["plc"])

# Mirror of gateway diagnosis_encoder codes — advisory display only.
_SITUATION_CODES: dict[str, int] = {
    "motor_overload": 301,
    "MOTOR_MECHANICAL_OVERLOAD": 301,
    "bus_undervoltage": 102,
    "DC_BUS_UNDERVOLTAGE": 102,
    "none": 0,
}
_ASSET_CODES: dict[str, int] = {
    "MTR-301": 301,
    "BUS-101": 101,
    "INV-102": 102,
    "PV-101": 101,
    "BAT-101": 101,
}
_SEVERITY_CODES: dict[str, int] = {
    "info": 1,
    "warning": 2,
    "critical": 3,
    "normal": 0,
}

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
    "bridge_source": "stub",
}

_bridge_snapshot: dict | None = None


def update_plc_snapshot(snapshot: dict) -> None:
    """Replace the cached PLC status snapshot (from bridge or tests)."""
    global _plc_state, _bridge_snapshot
    _plc_state = {**snapshot, "bridge_source": snapshot.get("bridge_source", "bridge")}
    _bridge_snapshot = snapshot


def _encode_advisory(situation: dict | None) -> dict[str, int]:
    if not situation:
        return {
            "PLANTLENS_ACTIVE": 0,
            "SITUATION_CODE": 0,
            "ROOT_ASSET_CODE": 0,
            "SEVERITY_CODE": 0,
            "CONFIDENCE_PERCENT": 0,
            "RECOMMENDED_ACTION_CODE": 0,
        }
    situation_type = str(situation.get("situation_type", "none"))
    root = str(situation.get("root_asset_id", ""))
    severity = str(situation.get("severity", "info")).lower()
    confidence = int(situation.get("confidence_percent", int(float(situation.get("confidence", 0.7)) * 100)))
    action_code = int(situation.get("recommended_action_code", 0))
    return {
        "PLANTLENS_ACTIVE": 1,
        "SITUATION_CODE": _SITUATION_CODES.get(situation_type, 999),
        "ROOT_ASSET_CODE": _ASSET_CODES.get(root, 0),
        "SEVERITY_CODE": _SEVERITY_CODES.get(severity, 1),
        "CONFIDENCE_PERCENT": max(0, min(100, confidence)),
        "RECOMMENDED_ACTION_CODE": action_code,
    }


def sync_from_bridge_situation(situation: dict | None) -> dict:
    """Fill status from gateway PlcBridgeService when importable; else local advisory encode."""
    global _plc_state, _bridge_snapshot
    try:
        from gateway.plc_bridge.bridge_service import PlcBridgeService

        bridge = PlcBridgeService()
        if situation:
            bridge.on_situation_change(situation)
        snap = bridge.snapshot()
        snap["bridge_source"] = "plc_bridge"
        _bridge_snapshot = snap
        _plc_state = snap
        return snap
    except Exception:
        snap = {
            "comms_ok": True,
            "advisory_registers": _encode_advisory(situation),
            "action_request_registers": {},
            "feedback": {
                "action_status": "none",
                "deny_reason": "none",
                "last_action_id": 0,
                "stale": True,
            },
            "bridge_source": "local_encode",
        }
        _bridge_snapshot = snap
        _plc_state = snap
        return snap


@router.get("/status")
async def get_plc_status(_principal: Principal = Depends(require_viewer)) -> dict:
    situation = next(iter(runtime_state.active_situations.values()), None)
    if _bridge_snapshot is None and situation:
        sync_from_bridge_situation(situation)

    return {
        **_plc_state,
        "active_situation_id": situation.get("situation_id") if situation else None,
        "advisory_only": True,
    }
