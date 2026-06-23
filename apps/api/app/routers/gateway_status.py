"""Read-only gateway connection status."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import httpx
from fastapi import APIRouter, Depends

from app.auth.dependencies import require_viewer
from app.auth.principal import Principal
from app.runtime.runtime_state import runtime_state
from app.settings import Settings, get_settings

router = APIRouter(prefix="/api/gateway", tags=["gateway"])


def _latest_frame_summary() -> dict[str, Any] | None:
    if not runtime_state.tags:
        return None
    latest = max(runtime_state.tags.values(), key=lambda frame: frame.timestamp)
    return {
        "tag_id": latest.tag_id,
        "asset_id": latest.asset_id,
        "source": latest.source,
        "gateway_id": latest.gateway_id,
        "timestamp": latest.timestamp.isoformat().replace("+00:00", "Z"),
        "quality": latest.quality,
    }


async def _gateway_health(settings: Settings) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=1.5) as client:
            response = await client.get(settings.gateway_health_url)
        if not response.is_success:
            return {
                "reachable": False,
                "status_code": response.status_code,
                "detail": response.text[:200],
            }
        body = response.json()
        return {
            "reachable": True,
            "status_code": response.status_code,
            "body": body,
        }
    except Exception as exc:
        return {
            "reachable": False,
            "status_code": None,
            "detail": f"{type(exc).__name__}: {exc}",
        }


@router.get("/status")
async def get_gateway_status(
    _principal: Principal = Depends(require_viewer),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Report gateway/API connection state without probing or controlling hardware."""
    latest_frame = _latest_frame_summary()
    return {
        "status": "ok",
        "checked_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "api_runtime": {
            "tag_count": len(runtime_state.tags),
            "alarm_count": len(runtime_state.active_alarms),
            "latest_frame": latest_frame,
        },
        "gateway_health": await _gateway_health(settings),
    }
