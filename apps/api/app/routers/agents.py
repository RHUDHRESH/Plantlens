"""Agent draft proxy + human approval gate (rule R5).

Approval A — approve_draft:
    Validates proposed changes, patches causal_graph.json with approved=false agent edges.
    Runtime is unchanged.

Approval B — approve_runtime_edge:
    Engineer promotes a specific agent-proposed edge to approved=true.
    Compiles to a temp dir, validates, then atomically promotes authored+compiled.
    Fails safe: keeps last known-good bundle on error; no mid-failure desync.
"""

from __future__ import annotations

import copy
import tempfile
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_human_approver, require_viewer
from app.auth.principal import Principal
from app.dependencies import get_db
from app.runtime.config_loader import hot_reload
from app.services.agent_queue import agent_draft_queue
from app.services.audit_chain import AuditChainService
from app.settings import Settings, get_settings
from app.studio.compiler import compile_authored_bundle
from app.studio.config_store import (
    atomic_promote_approval,
    load_authored,
    load_compiled,
    save_authored_causal_graph,
)
from app.studio.graph_patch import (
    apply_graph_patch,
    generate_graph_draft_candidates,
    validate_graph_patch,
)

router = APIRouter(prefix="/api/agents", tags=["agents"])
_audit = AuditChainService()


class GraphDraftRequest(BaseModel):
    context: dict = Field(default_factory=dict)
    prompt: str = Field(default="", max_length=4000)


class DraftAction(BaseModel):
    draft_id: str


# ---------------------------------------------------------------------------
# Path helpers
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


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/graph-draft")
async def request_graph_draft(
    body: GraphDraftRequest,
    principal: Principal = Depends(require_viewer),
    settings: Settings = Depends(get_settings),
) -> dict:
    payload = await _proxy_agents_service(
        settings,
        "/graph-draft",
        {"context": body.context, "prompt": body.prompt},
    )
    draft = agent_draft_queue.submit(
        draft_type="graph_draft",
        payload=payload,
        proposed_by=principal.subject,
    )
    return {"draft": draft}


@router.get("/drafts/pending")
async def list_pending_drafts(
    _principal: Principal = Depends(require_viewer),
) -> dict:
    return {"drafts": agent_draft_queue.list_pending()}


@router.post("/drafts/approve")
async def approve_draft(
    body: DraftAction,
    principal: Principal = Depends(require_human_approver),
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    try:
        draft = agent_draft_queue.resolve(
            body.draft_id,
            status="approved",
            resolved_by=principal.subject,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    now = datetime.now(UTC)
    patch_result = _run_graph_patch(draft, settings)

    record = await _audit.append(
        session,
        audit_id=str(uuid.uuid4()),
        ts=now.isoformat().replace("+00:00", "Z"),
        actor_type=principal.actor_type,
        actor_id=principal.subject,
        actor_role=principal.role,
        action="agent.draft.approve",
        entity_type="agent_draft",
        entity_id=body.draft_id,
        after={
            "draft_type": draft["draft_type"],
            "status": "approved",
            "patched": patch_result.get("authored_bundle_patched", False),
        },
    )
    await session.commit()
    bridge = _approval_bridge_result(draft, patch_result)
    return {"draft": draft, "audit_id": record.audit_id, "bridge": bridge}


@router.post("/drafts/reject")
async def reject_draft(
    body: DraftAction,
    principal: Principal = Depends(require_human_approver),
    session: AsyncSession = Depends(get_db),
) -> dict:
    try:
        draft = agent_draft_queue.resolve(
            body.draft_id,
            status="rejected",
            resolved_by=principal.subject,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    now = datetime.now(UTC)
    record = await _audit.append(
        session,
        audit_id=str(uuid.uuid4()),
        ts=now.isoformat().replace("+00:00", "Z"),
        actor_type=principal.actor_type,
        actor_id=principal.subject,
        actor_role=principal.role,
        action="agent.draft.reject",
        entity_type="agent_draft",
        entity_id=body.draft_id,
        after={"draft_type": draft["draft_type"], "status": "rejected"},
    )
    await session.commit()
    return {"draft": draft, "audit_id": record.audit_id}


@router.post("/graph-edges/{edge_id}/approve-runtime")
async def approve_runtime_edge(
    edge_id: str,
    principal: Principal = Depends(require_human_approver),
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Approval B: promote an agent_proposed edge to runtime-approved.

    Compiles into a temp directory first. Only on success atomically promotes
    authored causal_graph + live compiled bundle, then hot-reloads.
    Mid-failure after authored write rolls authored back — no desync.
    """
    sample_data_dir = _resolve_sample_data_dir(settings)
    compiled_dir = _resolve_compiled_dir(settings)

    bundle = load_authored(sample_data_dir)
    causal_graph = bundle["causal_graph"]

    edge = None
    edge_index: int | None = None
    for idx, e in enumerate(causal_graph.get("edges", [])):
        if e.get("id") == edge_id:
            edge = e
            edge_index = idx
            break

    if edge is None:
        raise HTTPException(
            status_code=404,
            detail=f"Edge '{edge_id}' not found in the authored causal graph.",
        )
    if edge.get("approved"):
        raise HTTPException(
            status_code=409,
            detail=f"Edge '{edge_id}' is already runtime-approved.",
        )
    if edge.get("provenance") != "agent_proposed":
        raise HTTPException(
            status_code=422,
            detail=(
                f"Edge '{edge_id}' has provenance '{edge.get('provenance')}'. "
                "Only agent_proposed edges go through this runtime approval path."
            ),
        )

    # Build test bundle — set approved=true only in the candidate, do not write yet
    test_bundle = copy.deepcopy(bundle)
    test_bundle["causal_graph"]["edges"][edge_index]["approved"] = True  # type: ignore[index]

    previous_live = load_compiled(compiled_dir, settings.active_plant_id)

    with tempfile.TemporaryDirectory(prefix="plantlens-approve-b-") as tmp:
        temp_compiled_dir = Path(tmp) / "compiled"
        temp_compiled_dir.mkdir(parents=True, exist_ok=True)
        result = compile_authored_bundle(
            plant_id=settings.active_plant_id,
            bundle=test_bundle,
            compiled_dir=temp_compiled_dir,
        )

        if result.get("status") != "ok":
            raise HTTPException(
                status_code=422,
                detail={
                    "message": (
                        "Compile failed — keeping last known-good runtime bundle. "
                        "No changes written."
                    ),
                    "errors": result.get("errors", []),
                },
            )

        try:
            atomic_promote_approval(
                sample_data_dir=sample_data_dir,
                live_compiled_dir=compiled_dir,
                temp_compiled_dir=temp_compiled_dir,
                plant_id=settings.active_plant_id,
                causal_graph=test_bundle["causal_graph"],
            )
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail={
                    "message": (
                        "Atomic promote failed — authored and compiled left unchanged "
                        "(or authored rolled back). Last known-good retained."
                    ),
                    "error": str(exc),
                },
            ) from exc

    hot_reload(settings.active_plant_id, sample_data_dir=sample_data_dir)

    graph_hash = result["compiled"]["content_hash"]
    now = datetime.now(UTC)
    record = await _audit.append(
        session,
        audit_id=str(uuid.uuid4()),
        ts=now.isoformat().replace("+00:00", "Z"),
        actor_type=principal.actor_type,
        actor_id=principal.subject,
        actor_role=principal.role,
        action="agent.graph_edge.approve_runtime",
        entity_type="causal_graph_edge",
        entity_id=edge_id,
        before={
            "approved": False,
            "provenance": edge.get("provenance"),
            "previous_hash": previous_live.get("content_hash") if previous_live else None,
        },
        after={"approved": True, "graph_hash": graph_hash},
    )
    await session.commit()

    return {
        "edge_id": edge_id,
        "runtime_approved": True,
        "compiled": True,
        "graph_hash": graph_hash,
        "runtime_deployed": True,
        "audit_id": record.audit_id,
        "next_action": "Runtime hot-reloaded. The edge is now active in the DAG.",
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _run_graph_patch(draft: dict[str, Any], settings: Settings) -> dict[str, Any]:
    """Validate, patch, compile — write only if compile succeeds (Approval A).

    Keeps last-known-good authored graph on compile failure. Edges remain
    approved=false until Approval B (approve-runtime-edge) promotes them.
    """
    payload = draft.get("payload", {})
    proposed = payload.get("proposed_changes") or []

    if draft.get("draft_type") != "graph_draft" or not proposed:
        return {"authored_bundle_patched": False, "patch_errors": [], "patch_warnings": []}

    try:
        sample_data_dir = _resolve_sample_data_dir(settings)
        compiled_dir = _resolve_compiled_dir(settings)
        bundle = load_authored(sample_data_dir)
        validation = validate_graph_patch(bundle, payload)

        if not validation.valid:
            return {
                "authored_bundle_patched": False,
                "patch_errors": [
                    {"code": e.code, "message": e.message, "fix": e.fix}
                    for e in validation.errors
                ],
                "patch_warnings": [
                    {"code": w.code, "message": w.message} for w in validation.warnings
                ],
                "compile_status": "patch_validation_failed",
                "next_action": "Fix the validation errors and resubmit the draft.",
            }

        new_bundle = apply_graph_patch(bundle, payload)
        compile_result = compile_authored_bundle(
            plant_id=settings.active_plant_id,
            bundle=new_bundle,
            compiled_dir=compiled_dir,
        )

        if compile_result.get("status") != "ok":
            return {
                "authored_bundle_patched": False,
                "compiled": False,
                "patch_errors": [
                    {
                        "code": "COMPILE_FAILED",
                        "message": "Compile failed — keeping last known-good authored bundle. No changes written.",
                        "fix": "Fix graph/contract errors and resubmit.",
                    }
                ],
                "compile_errors": compile_result.get("errors", []),
                "patch_warnings": [
                    {"code": w.code, "message": w.message} for w in validation.warnings
                ],
                "compile_status": "compile_failed_lkg_kept",
                "next_action": "Compile failed. Authored causal graph unchanged (last known good).",
            }

        # Compile passed — persist unapproved edges and hot-reload indexes.
        save_authored_causal_graph(sample_data_dir, new_bundle["causal_graph"])
        hot_reload(settings.active_plant_id, sample_data_dir=sample_data_dir)

        edges_added = sum(1 for c in proposed if c.get("change_type") == "add_causal_edge")
        return {
            "authored_bundle_patched": True,
            "compiled": True,
            "edges_added": edges_added,
            "graph_hash": compile_result["compiled"]["content_hash"],
            "patch_errors": [],
            "patch_warnings": [
                {"code": w.code, "message": w.message} for w in validation.warnings
            ],
            "compile_status": "compiled_awaiting_runtime_approval",
            "next_action": (
                "Agent-proposed edges patched and compiled with approved=false. "
                "Engineer must promote each edge via "
                "POST /api/agents/graph-edges/{id}/approve-runtime."
            ),
        }

    except Exception as exc:
        return {
            "authored_bundle_patched": False,
            "compiled": False,
            "patch_errors": [
                {
                    "code": "PATCH_EXCEPTION",
                    "message": str(exc),
                    "fix": "Check that the authored bundle is accessible.",
                }
            ],
            "compile_status": "patch_exception",
        }


async def _proxy_agents_service(settings: Settings, path: str, body: dict) -> dict:
    url = f"{settings.agents_base_url.rstrip('/')}{path}"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(url, json=body)
            response.raise_for_status()
            return response.json()
    except Exception:
        return _local_stub_draft(body, settings)


def _approval_bridge_result(
    draft: dict[str, Any], patch_result: dict[str, Any] | None = None
) -> dict[str, Any]:
    payload = draft.get("payload", {})
    proposed = payload.get("proposed_changes") or []
    compile_status = "skipped_no_changes"
    if proposed and patch_result:
        compile_status = patch_result.get("compile_status", "pending_contract_patch")
    elif proposed:
        compile_status = "pending_contract_patch"

    result: dict[str, Any] = {
        "runtime_deployed": False,
        "compile_status": compile_status,
        "approved_artifact_stored": True,
        "message": (
            "Draft approved and audited. Edges stay approved=false until "
            "runtime promotion; compile validates contracts without activating DAG edges."
            if proposed
            else (
                "Draft approved and audited. Runtime unchanged until contract patch, "
                "validation, and bundle compile/deploy."
            )
        ),
    }
    if patch_result:
        result.update(patch_result)
    return result


def _local_stub_draft(body: dict[str, Any], settings: Settings | None = None) -> dict[str, Any]:
    """Deterministic draft from evidence when agents service is unavailable.

    Falls back to service_unavailable when no evidence_packet is present.
    """
    evidence = body.get("context", {}).get("evidence_packet")
    if not evidence or not settings:
        return {
            "artifact_type": "service_unavailable",
            "summary": "Agent service unavailable. Runtime unaffected.",
            "proposed_changes": [],
            "requires_human_approval": True,
            "explanation": "Draft agents are offline. Deterministic runtime continues unchanged.",
            "validation_status": "pending",
            "risk_level": "unknown",
        }

    try:
        sample_data_dir = _resolve_sample_data_dir(settings)
        bundle = load_authored(sample_data_dir)
        causal_graph = bundle.get("causal_graph", {})
        node_ids = {n["id"] for n in causal_graph.get("nodes", [])}
        edge_pairs: set[tuple[str, str, str]] = {
            (e.get("from", ""), e.get("to", ""), e.get("edge_type", ""))
            for e in causal_graph.get("edges", [])
        }

        candidates = generate_graph_draft_candidates(evidence, node_ids, edge_pairs)
        evidence_id = evidence.get("evidence_id", "")

        return {
            "artifact_type": "graph_draft",
            "summary": (
                f"Detected {len(candidates)} candidate causal edge(s) from evidence {evidence_id}."
                if candidates
                else f"No new edge candidates found in evidence {evidence_id}."
            ),
            "proposed_changes": candidates,
            "source_evidence_ids": [evidence_id] if evidence_id else [],
            "requires_human_approval": True,
            "explanation": (
                "Candidates generated deterministically from alarm ordering. "
                "All edges require human validation and runtime approval."
            ),
            "validation_status": "pending",
            "risk_level": "medium",
        }
    except Exception:
        return {
            "artifact_type": "service_unavailable",
            "summary": "Agent service unavailable. Runtime unaffected.",
            "proposed_changes": [],
            "requires_human_approval": True,
            "explanation": "Draft agents are offline. Deterministic runtime continues unchanged.",
            "validation_status": "pending",
            "risk_level": "unknown",
        }
