"""REST reads — GET only (Law #1: read-only by construction).

Cold reads: model files, screens, audit ledger, current plant state, history.
No write endpoints exist. The copilot is bound ONLY to these (Domain Q).
"""
from __future__ import annotations

import json

from fastapi import APIRouter

from ..audit.ledger import AuditLedger
from ..config import MODELS_DIR
from ..pipeline.orchestrator import get_orchestrator

router = APIRouter()

_ledger = AuditLedger()


def _read_model(name: str) -> dict:
    p = MODELS_DIR / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


@router.get("/state")
async def state() -> dict:
    orch = get_orchestrator()
    res = await orch.tick()
    return {"ts": res.ts, "degraded": res.degraded,
            "values": [v.model_dump() for v in res.values],
            "situations": [s.__dict__ for s in res.situations]}


@router.get("/models/{name}")
async def get_model(name: str) -> dict:
    return _read_model(f"{name}.json")


@router.get("/audit")
async def audit() -> dict:
    return {"head": _ledger.head, "entries": [e.__dict__ for e in _ledger.entries()],
            "verified": _ledger.verify()}


ledger = _ledger  # exported for ws/agent use
