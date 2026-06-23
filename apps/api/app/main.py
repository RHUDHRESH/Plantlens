"""
PlantLens API entrypoint.

FastAPI application factory: settings, lifespan, middleware, routers. No business logic here.
"""

import uuid

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.lifespan import lifespan
from app.routers import (
    agents,
    compiler,
    health,
    hmi,
    gateway_commission,
    gateway_status,
    incidents,
    ingest,
    internal_auth,
    library,
    offline_ingest,
    plc_status,
    runtime_api,
    simulator,
    ws,
)
from app.settings import get_settings


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Propagate or generate X-Request-ID for trace correlation."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


def create_app() -> FastAPI:
    """Build the FastAPI application (health shell only in Prompt 7)."""
    settings = get_settings()
    app = FastAPI(
        title="PlantLens API",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.web_origin],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestIDMiddleware)
    app.include_router(health.router)
    app.include_router(internal_auth.router)
    app.include_router(simulator.router)
    app.include_router(ws.router)
    app.include_router(compiler.router)
    app.include_router(library.router)
    app.include_router(hmi.router)
    app.include_router(gateway_status.router)
    app.include_router(gateway_commission.router)
    app.include_router(runtime_api.router)
    app.include_router(ingest.router)
    app.include_router(offline_ingest.router)
    app.include_router(incidents.router)
    app.include_router(agents.router)
    app.include_router(plc_status.router)
    return app


app = create_app()
