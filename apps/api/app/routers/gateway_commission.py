"""Gateway commissioning surface — proxy to apps/gateway health/commission endpoints."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Query

from app.auth.dependencies import require_engineer, require_viewer
from app.auth.principal import Principal
from app.runtime.runtime_state import runtime_state
from app.settings import Settings, get_settings

router = APIRouter(prefix="/api/gateway", tags=["gateway"])


def _gateway_service_base(settings: Settings) -> str:
    url = settings.gateway_health_url.rstrip("/")
    if url.endswith("/health"):
        return url[: -len("/health")]
    return url


async def _proxy_gateway(path: str, *, settings: Settings, params: dict[str, Any] | None = None) -> dict[str, Any]:
    base = _gateway_service_base(settings)
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(f"{base}{path}", params=params)
        if not response.is_success:
            return {
                "reachable": False,
                "status_code": response.status_code,
                "detail": response.text[:200],
            }
        return {"reachable": True, "status_code": response.status_code, "body": response.json()}
    except Exception as exc:
        return {
            "reachable": False,
            "status_code": None,
            "detail": f"{type(exc).__name__}: {exc}",
        }


@router.get("/ports")
async def list_gateway_ports(
    _principal: Principal = Depends(require_engineer),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """List serial COM ports exposed by the gateway process (read-only commissioning)."""
    proxied = await _proxy_gateway("/commission/ports", settings=settings)
    if proxied.get("reachable"):
        body = proxied["body"]
        return {
            "status": "ok",
            "checked_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "ports": body.get("ports", []),
            "gateway_reachable": True,
        }
    return {
        "status": "unavailable",
        "checked_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "ports": [],
        "gateway_reachable": False,
        "detail": proxied.get("detail"),
    }


@router.get("/probe")
async def probe_gateway_port(
    port: str = Query(..., min_length=1),
    baudrate: int = Query(default=9600, ge=300, le=921600),
    _principal: Principal = Depends(require_engineer),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Probe whether a serial port can be opened (gateway-side, read-only)."""
    proxied = await _proxy_gateway(
        "/commission/probe",
        settings=settings,
        params={"port": port, "baudrate": baudrate},
    )
    if proxied.get("reachable"):
        return {
            "status": "ok",
            "checked_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            **proxied["body"],
        }
    return {
        "status": "unavailable",
        "checked_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "port": port,
        "available": False,
        "detail": proxied.get("detail"),
    }


@router.get("/connection/status")
async def get_gateway_connection_status(
    _principal: Principal = Depends(require_viewer),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Unified connection status: API runtime + gateway poller diagnostics."""
    from app.routers.gateway_status import _gateway_health, _latest_frame_summary

    latest_frame = _latest_frame_summary()
    gateway_health = await _gateway_health(settings)
    proxied = await _proxy_gateway("/health", settings=settings)
    poller = proxied["body"] if proxied.get("reachable") else None
    return {
        "status": "ok",
        "checked_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "api_runtime": {
            "tag_count": len(runtime_state.tags),
            "alarm_count": len(runtime_state.active_alarms),
            "latest_frame": latest_frame,
        },
        "gateway_health": gateway_health,
        "poller": poller,
        "contract": {
            "websocket": "/api/ws/runtime",
            "message_type": "runtime.snapshot",
            "ingest": "/api/ingest/frame",
        },
    }