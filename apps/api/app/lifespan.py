"""Application lifespan (startup/shutdown)."""

from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI

from app.db.session import dispose_db_engine, init_db_engine
from app.services.observability import init_observability
from app.settings import Settings, get_settings

log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Bind settings and DB engine. No migrations, seeding, or runtime loops."""
    settings: Settings = get_settings()
    app.state.settings = settings
    # Safe when OTEL_EXPORTER_OTLP_ENDPOINT is unset or OTEL deps missing.
    init_observability(otlp_endpoint=settings.otel_exporter_otlp_endpoint)
    init_db_engine(settings.database_url)
    log.info(
        "plantlens_api_starting",
        env=settings.plantlens_env,
        active_plant_id=settings.active_plant_id,
        otlp_enabled=bool(settings.otel_exporter_otlp_endpoint),
    )
    yield
    await dispose_db_engine()
    log.info("plantlens_api_stopping")
