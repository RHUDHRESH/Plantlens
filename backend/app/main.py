"""FastAPI app — read-only backend serving built frontend + WS stream (Domain W).

Uses FastAPI 0.138.0's app.frontend('/', directory='dist') (or StaticFiles mount)
to serve the built Vite SPA in prod. WebSocket pushes canonical/Situation deltas;
REST is for cold reads and model fetch. Don't duplicate state logic across the two.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .api.rest import router as rest_router
from .api.ws import router as ws_router
from .hmi.compiler import compile_screens

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / "frontend" / "dist"

app = FastAPI(title="PlantLens", version="0.1.0",
              description="Read-only industrial HMI cognition layer.")

app.include_router(rest_router, prefix="/api")
app.include_router(ws_router, prefix="/ws")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": "0.1.0"}


@app.get("/api/screens")
async def screens() -> dict:
    return compile_screens()


if DIST.exists():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="frontend")
