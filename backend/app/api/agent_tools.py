"""Read-only MCP tool surface for the copilot (Domain Q).

The copilot is bound ONLY to these tools, all GET. Enforced by construction:
no write tools exist -> prompt-injection cannot escalate (IEC 62443 defense-in-depth).

Contracts the agent must obey (see agent/system_prompt.md):
  - cite-or-silent: every factual claim ties to a signal_id + ts + value read here
  - narrates-never-diagnoses: explains the deterministic engine; never diagnoses
  - never computes AVAILABLE: reads the pre-computed Action Envelope only
"""
from __future__ import annotations

from fastapi import APIRouter

from ..pipeline.orchestrator import get_orchestrator

router = APIRouter()


@router.get("/tools/state")
async def tool_state() -> dict:
    """Query current plant state (signal values + situations)."""
    orch = get_orchestrator()
    res = await orch.tick()
    return {"ts": res.ts, "values": [v.model_dump() for v in res.values],
            "situations": [s.__dict__ for s in res.situations]}


@router.get("/tools/explain")
async def tool_explain(situation_id: str) -> dict:
    """Explain a situation's evidence path (narrate, never diagnose)."""
    return {"situation_id": situation_id, "explanation": "scaffold: evidence path"}


@router.get("/tools/logs")
async def tool_logs(since: float = 0.0) -> dict:
    """Pass-through audit logs (never fabricated)."""
    from .rest import ledger
    return {"entries": [e.__dict__ for e in ledger.entries() if e.ts >= since]}
