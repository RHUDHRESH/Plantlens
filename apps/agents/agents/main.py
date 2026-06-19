"""Agents FastAPI app — draft endpoints only."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from agents.registry import FORBIDDEN_TOOLS, run_agent

app = FastAPI(title="PlantLens Agents", version="0.1.0")


class GraphDraftBody(BaseModel):
    context: dict = Field(default_factory=dict)
    prompt: str = ""


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok", "service": "plantlens-agents"}


@app.post("/graph-draft")
def graph_draft(body: GraphDraftBody) -> dict:
    if any(tool in FORBIDDEN_TOOLS for tool in body.context.get("tools", [])):
        raise HTTPException(status_code=403, detail="Forbidden tool requested")
    return run_agent("graph_draft", {"prompt": body.prompt, "context": body.context})