"""Application lifespan (startup/shutdown)."""

from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI

from app.db.session import dispose_db_engine, init_db_engine
from app.settings import Settings, get_settings

log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Bind settings and DB engine, and run the periodic runtime ticker (no migrations/seeding)."""
    settings: Settings = get_settings()
    app.state.settings = settings
    init_db_engine(settings.database_url)
    log.info(
        "plantlens_api_starting",
        env=settings.plantlens_env,
        active_plant_id=settings.active_plant_id,
    )
    ticker = None
    if settings.runtime_tick_ms > 0:
        from app.runtime.simulator.simulator_gateway import get_simulator_gateway
        from app.runtime.ticker import RuntimeTicker

        ticker = RuntimeTicker(get_simulator_gateway(), interval_ms=settings.runtime_tick_ms)
        ticker.start()
    app.state.runtime_ticker = ticker
    yield
    if ticker is not None:
        await ticker.stop()
    await dispose_db_engine()
    log.info("plantlens_api_stopping")