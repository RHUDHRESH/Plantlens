"""Health and readiness probes."""

from fastapi import APIRouter, Request, Response

from app.db.session import check_database_connectivity
from app.services.observability import metrics_payload

router = APIRouter(tags=["health"])


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    """Liveness: process is up."""
    return {"status": "ok", "service": "plantlens-api"}


@router.get("/readyz")
async def readyz(request: Request) -> dict[str, str]:
    """Readiness: shell configured; database connectivity only (no secret leakage)."""
    settings = request.app.state.settings
    database_ok = await check_database_connectivity()
    return {
        "status": "ready" if database_ok else "degraded",
        "active_plant_id": settings.active_plant_id,
        "database": "ok" if database_ok else "unavailable",
    }


@router.get("/metrics")
async def metrics() -> Response:
    payload = metrics_payload()
    if payload is None:
        return Response(content="# prometheus_client not installed\n", media_type="text/plain")
    return Response(content=payload, media_type="text/plain; version=0.0.4; charset=utf-8")