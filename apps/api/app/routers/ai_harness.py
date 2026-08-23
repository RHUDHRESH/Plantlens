"""AI Harness API routes — evidence-grounded, role-gated, audit-backed."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_harness.context_builder import build_context
from app.ai_harness.conversation_service import (
    answer_message,
    _get_builtin_template,
    _infer_asset_type,
    _get_builtin_scenario_template,
)
from app.ai_harness.intents import classify_intent
from app.ai_harness.proactive_cards import (
    proactive_card_store,
    generate_agent_draft_card,
    generate_compile_failed_card,
)
from app.ai_harness.response_schema import AIResponse, ProactiveCard
from app.auth.dependencies import require_engineer, require_viewer
from app.auth.principal import Principal
from app.dependencies import get_db
from app.runtime.runtime_state import runtime_state
from app.services.audit_chain import AuditChainService
from app.settings import Settings, get_settings
from app.studio.config_store import load_authored, load_compiled

router = APIRouter(prefix="/api/ai", tags=["ai_harness"])
_audit = AuditChainService()


class MessageRequest(BaseModel):
    message: str = Field(..., max_length=2000)
    conversation_id: str | None = None


class CardAction(BaseModel):
    card_id: str


class TemplateRequest(BaseModel):
    asset_type: str
    instance_hint: str = ""


class ScenarioDraftRequest(BaseModel):
    asset_type: str
    fault_pattern: str = ""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _resolve_sample_data_dir(settings: Settings) -> Path:
    path = Path(settings.sample_data_dir)
    if not path.is_absolute():
        path = Path(__file__).resolve().parents[2] / settings.sample_data_dir
    return path


def _resolve_compiled_dir(settings: Settings) -> Path:
    path = Path(settings.compiled_dir)
    if not path.is_absolute():
        path = Path(__file__).resolve().parents[2] / settings.compiled_dir
    return path


def _load_compiled_bundle(settings: Settings) -> dict[str, Any] | None:
    try:
        compiled_dir = _resolve_compiled_dir(settings)
        return load_compiled(compiled_dir, settings.active_plant_id)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# GET /api/ai/provider/health
# ---------------------------------------------------------------------------


@router.get("/provider/health")
async def provider_health(
    _principal: Principal = Depends(require_viewer),
    settings: Settings = Depends(get_settings),
) -> dict:
    """LLM provider health for the Advisor badge. Does not diagnose plant faults."""
    from app.ai_harness.llm_client import acheck_llm_health

    health = await acheck_llm_health(settings)
    state = "live" if health.healthy else ("offline" if not health.enabled else "degraded")
    return {
        "enabled": health.enabled,
        "healthy": health.healthy,
        "state": state,
        "base_url": health.base_url,
        "model": health.model,
        "detail": health.detail,
        "advisory_only": True,
    }


# ---------------------------------------------------------------------------
# POST /api/ai/message
# ---------------------------------------------------------------------------


@router.post("/message")
async def ai_message(
    body: MessageRequest,
    principal: Principal = Depends(require_viewer),
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Submit a natural-language message and receive a deterministic, evidence-grounded response."""
    intent = classify_intent(body.message)
    snapshot = runtime_state.snapshot()
    compiled = _load_compiled_bundle(settings)

    response: AIResponse = await answer_message(
        body.message,
        role=principal.role,
        snapshot=snapshot,
        compiled_bundle=compiled,
        settings=settings,
    )

    now = datetime.now(UTC)
    ep = snapshot.get("latest_evidence_packet") or {}
    await _audit.append(
        session,
        audit_id=str(uuid.uuid4()),
        ts=now.isoformat().replace("+00:00", "Z"),
        actor_type=principal.actor_type,
        actor_id=principal.subject,
        actor_role=principal.role,
        action="ai.message.received",
        entity_type="ai_response",
        entity_id=response.response_id,
        after={
            "intent": str(intent),
            "response_id": response.response_id,
            "evidence_id": ep.get("evidence_id"),
            "situation_id": ep.get("situation_id"),
            "deterministic_trace_id": ep.get("deterministic_trace_id"),
            "confidence": response.confidence,
        },
    )
    await session.commit()

    return {"response": response.model_dump(), "intent": str(intent)}


# ---------------------------------------------------------------------------
# GET /api/ai/context/current  (engineer-only debug)
# ---------------------------------------------------------------------------


@router.get("/context/current")
async def get_ai_context(
    principal: Principal = Depends(require_engineer),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Return compact AIContext for the current runtime state (debug/engineer only)."""
    snapshot = runtime_state.snapshot()
    compiled = _load_compiled_bundle(settings)
    ctx = build_context(role=principal.role, snapshot=snapshot, compiled_bundle=compiled)
    return {
        "plant_id": ctx.plant_id,
        "role": ctx.role,
        "has_evidence": ctx.latest_evidence_packet is not None,
        "has_calm_card": ctx.calm_card is not None,
        "active_alarm_count": len(ctx.active_alarms),
        "rejected_candidate_count": len(ctx.rejected_candidates),
        "causal_path_length": len(ctx.causal_path),
        "stale_or_bad_tags": ctx.stale_or_bad_tags,
        "allowed_intents": [str(i) for i in ctx.allowed_intents],
        "known_asset_count": len(ctx.known_asset_ids),
        "known_alarm_count": len(ctx.known_alarm_ids),
        "graph_edge_count": len(ctx.graph_edges),
    }


# ---------------------------------------------------------------------------
# GET /api/ai/cards
# ---------------------------------------------------------------------------


@router.get("/cards")
async def get_proactive_cards(
    principal: Principal = Depends(require_viewer),
) -> dict:
    """Return role-filtered proactive cards."""
    cards = proactive_card_store.get_active(principal.role)
    return {
        "role": principal.role,
        "count": len(cards),
        "cards": [c.model_dump() for c in cards],
    }


@router.post("/cards/{card_id}/dismiss")
async def dismiss_card(
    card_id: str,
    principal: Principal = Depends(require_viewer),
    session: AsyncSession = Depends(get_db),
) -> dict:
    card = proactive_card_store.dismiss(card_id)
    if card is None:
        raise HTTPException(status_code=404, detail=f"Card '{card_id}' not found.")
    now = datetime.now(UTC)
    await _audit.append(
        session,
        audit_id=str(uuid.uuid4()),
        ts=now.isoformat().replace("+00:00", "Z"),
        actor_type=principal.actor_type,
        actor_id=principal.subject,
        actor_role=principal.role,
        action="ai.card.dismissed",
        entity_type="proactive_card",
        entity_id=card_id,
        after={"dismissed": True, "card_type": card.card_type},
    )
    await session.commit()
    return {"card_id": card_id, "dismissed": True}


@router.post("/cards/{card_id}/pin")
async def pin_card(
    card_id: str,
    principal: Principal = Depends(require_viewer),
    session: AsyncSession = Depends(get_db),
) -> dict:
    card = proactive_card_store.pin(card_id)
    if card is None:
        raise HTTPException(status_code=404, detail=f"Card '{card_id}' not found.")
    now = datetime.now(UTC)
    await _audit.append(
        session,
        audit_id=str(uuid.uuid4()),
        ts=now.isoformat().replace("+00:00", "Z"),
        actor_type=principal.actor_type,
        actor_id=principal.subject,
        actor_role=principal.role,
        action="ai.card.pinned",
        entity_type="proactive_card",
        entity_id=card_id,
        after={"pinned": True, "card_type": card.card_type},
    )
    await session.commit()
    return {"card_id": card_id, "pinned": True}


# ---------------------------------------------------------------------------
# POST /api/ai/drafts/signal-template  (engineer only)
# ---------------------------------------------------------------------------


@router.post("/drafts/signal-template")
async def draft_signal_template(
    body: TemplateRequest,
    principal: Principal = Depends(require_engineer),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Generate a draft signal template for the given asset type."""
    asset_type = body.asset_type.lower().replace("-", "_").replace(" ", "_")
    template = _get_builtin_template(asset_type)

    draft_id = f"DRF_TMPL_{uuid.uuid4().hex[:8].upper()}"
    now = datetime.now(UTC)
    await _audit.append(
        session,
        audit_id=str(uuid.uuid4()),
        ts=now.isoformat().replace("+00:00", "Z"),
        actor_type=principal.actor_type,
        actor_id=principal.subject,
        actor_role=principal.role,
        action="ai.draft.created",
        entity_type="signal_template_draft",
        entity_id=draft_id,
        after={"asset_type": asset_type, "draft_id": draft_id},
    )
    await session.commit()

    # Generate proactive card so engineers see the draft
    card = generate_agent_draft_card(draft_id, f"Signal template for {asset_type}.")
    proactive_card_store.upsert(card)

    return {
        "draft_id": draft_id,
        "asset_type": asset_type,
        "template": template,
        "requires_human_approval": True,
        "apply_endpoint": "POST /api/ai/drafts/apply-template",
        "note": (
            "Draft only. Review required_tags, default_alarms, and thresholds. "
            "Apply via apply-template endpoint after engineering sign-off."
        ),
    }


# ---------------------------------------------------------------------------
# POST /api/ai/drafts/scenario  (engineer + maintenance)
# ---------------------------------------------------------------------------


@router.post("/drafts/scenario")
async def draft_scenario(
    body: ScenarioDraftRequest,
    principal: Principal = Depends(require_viewer),
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Generate a draft scenario for the given asset type fault pattern."""
    if principal.role not in ("engineer", "maintenance", "admin"):
        raise HTTPException(status_code=403, detail="Engineer or maintenance role required.")

    asset_type = body.asset_type.lower().replace("-", "_").replace(" ", "_")
    snapshot = runtime_state.snapshot()
    ep = snapshot.get("latest_evidence_packet")
    scenario = _get_builtin_scenario_template(asset_type, ep)

    draft_id = f"DRF_SCN_{uuid.uuid4().hex[:8].upper()}"
    now = datetime.now(UTC)
    await _audit.append(
        session,
        audit_id=str(uuid.uuid4()),
        ts=now.isoformat().replace("+00:00", "Z"),
        actor_type=principal.actor_type,
        actor_id=principal.subject,
        actor_role=principal.role,
        action="ai.draft.created",
        entity_type="scenario_draft",
        entity_id=draft_id,
        after={"asset_type": asset_type, "draft_id": draft_id},
    )
    await session.commit()

    return {
        "draft_id": draft_id,
        "asset_type": asset_type,
        "scenario": scenario,
        "requires_human_approval": True,
        "note": "Draft scenario. Edit events, thresholds, and expected values before adding to scenarios.json.",
    }


# ---------------------------------------------------------------------------
# POST /api/ai/drafts/apply-template  (engineer only)
# ---------------------------------------------------------------------------


@router.post("/drafts/apply-template")
async def apply_template(
    body: TemplateRequest,
    principal: Principal = Depends(require_engineer),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Apply a template — returns a DraftArtifact that must go through agent approval pipeline."""
    asset_type = body.asset_type.lower().replace("-", "_").replace(" ", "_")
    template = _get_builtin_template(asset_type)
    draft_id = f"DRF_APPLY_{uuid.uuid4().hex[:8].upper()}"
    now = datetime.now(UTC)

    artifact = {
        "draft_id": draft_id,
        "artifact_type": "signal_template_draft",
        "asset_type": asset_type,
        "instance_hint": body.instance_hint,
        "template": template,
        "requires_human_approval": True,
        "validation_status": "pending",
        "status": "pending",
        "created_at": now.isoformat().replace("+00:00", "Z"),
        "created_by": principal.subject,
        "note": (
            "Apply this template by instantiating tags, alarm rules, and causal edges "
            "into your plant bundle. Use POST /api/compiler/compile after editing."
        ),
    }

    await _audit.append(
        session,
        audit_id=str(uuid.uuid4()),
        ts=now.isoformat().replace("+00:00", "Z"),
        actor_type=principal.actor_type,
        actor_id=principal.subject,
        actor_role=principal.role,
        action="ai.draft.created",
        entity_type="template_apply_draft",
        entity_id=draft_id,
        after={"asset_type": asset_type, "draft_id": draft_id},
    )
    await session.commit()

    return {"draft": artifact}
