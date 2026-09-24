"""Change pipeline: draft → engineer review → new bundle revision → compile → hot deploy.

Invariants:
* Proposers (agents, pattern library, Studio) only create ``pending`` change requests.
* Only a human engineer/admin can approve; approval requires a comment (R5).
* A change applies only on top of the revision it was drafted against (optimistic
  concurrency); a stale draft must be re-submitted, never silently rebased.
* Every approved change becomes a new immutable revision; nothing is edited in place.
* The runtime swaps to a new immutable config atomically (R2); in-flight state is reconciled.
* Every step is written to the hash-chained audit ledger (R6).
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.principal import Principal
from app.changes.ops import ChangeSet, ChangeSetError, apply_change_set
from app.changes.validation import validate_bundle
from app.db.models.authored import BundleRevision, ChangeRequest
from app.runtime.config_loader import (
    build_runtime_config,
    deploy_runtime_config,
    get_runtime_config,
    read_bundle_files,
)
from app.services.audit_chain import AuditChainService
from app.settings import get_settings

log = structlog.get_logger(__name__)
_audit = AuditChainService()

ENTITY_KEYS: dict[tuple[str, str], str] = {
    ("causal_graph", "nodes"): "id",
    ("causal_graph", "edges"): "id",
    ("causal_graph", "situation_types"): "id",
    ("alarm_rules", "rules"): "id",
}


class ChangePipelineError(Exception):
    def __init__(self, status_code: int, detail: Any) -> None:
        super().__init__(str(detail))
        self.status_code = status_code
        self.detail = detail


def _now() -> datetime:
    return datetime.now(UTC)


def _iso(ts: datetime) -> str:
    return ts.isoformat().replace("+00:00", "Z")


def bundle_hash(bundle: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(bundle, sort_keys=True, default=str).encode()).hexdigest()


def _sample_dir() -> Path:
    settings = get_settings()
    path = Path(settings.sample_data_dir)
    if not path.is_absolute():
        path = Path(__file__).resolve().parents[2] / settings.sample_data_dir
    return path


def entity_diff(before: dict[str, Any], after: dict[str, Any]) -> list[dict[str, Any]]:
    """Per-entity diff (added / removed / changed with field-level before/after)."""
    out: list[dict[str, Any]] = []
    for (doc, collection), key in ENTITY_KEYS.items():
        b_items = {i[key]: i for i in (before.get(doc) or {}).get(collection, [])}
        a_items = {i[key]: i for i in (after.get(doc) or {}).get(collection, [])}
        for entity_id in sorted(set(b_items) | set(a_items)):
            old, new = b_items.get(entity_id), a_items.get(entity_id)
            if old == new:
                continue
            entry: dict[str, Any] = {"doc": doc, "collection": collection, "id": entity_id}
            if old is None:
                entry.update(kind="added", after=new)
            elif new is None:
                entry.update(kind="removed", before=old)
            else:
                fields = sorted(k for k in set(old) | set(new) if old.get(k) != new.get(k))
                entry.update(
                    kind="changed",
                    fields={f: {"before": old.get(f), "after": new.get(f)} for f in fields},
                )
            out.append(entry)
    b_rules = (before.get("causal_graph") or {}).get("root_cause_rules", [])
    a_rules = (after.get("causal_graph") or {}).get("root_cause_rules", [])
    for rule in a_rules:
        if rule not in b_rules:
            out.append({"doc": "causal_graph", "collection": "root_cause_rules", "id": rule.get("target_node"),
                        "kind": "added", "after": rule})
    return out


async def _audit_append(
    session: AsyncSession,
    principal: Principal | None,
    action: str,
    entity_type: str,
    entity_id: str,
    *,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    reason: str | None = None,
) -> str:
    record = await _audit.append(
        session,
        audit_id=str(uuid.uuid4()),
        ts=_iso(_now()),
        actor_type=principal.actor_type if principal else "system",
        actor_id=principal.subject if principal else "system",
        actor_role=principal.role if principal else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        plant_id=get_settings().active_plant_id,
        before=before,
        after=after,
        reason=reason,
    )
    return record.audit_id


# --- Revisions ---------------------------------------------------------------------------


async def latest_revision(session: AsyncSession) -> BundleRevision | None:
    result = await session.execute(select(BundleRevision).order_by(BundleRevision.rev.desc()).limit(1))
    return result.scalar_one_or_none()


async def get_revision(session: AsyncSession, rev: int) -> BundleRevision | None:
    return await session.get(BundleRevision, rev)


async def ensure_seed_revision(session: AsyncSession) -> BundleRevision:
    """Revision 1 = the authored files on disk, created on first use."""
    current = await latest_revision(session)
    if current is not None:
        return current
    bundle = read_bundle_files(_sample_dir())
    seed = BundleRevision(
        rev=1,
        plant_id=get_settings().active_plant_id,
        parent_rev=None,
        bundle_hash=bundle_hash(bundle),
        bundle_json=bundle,
        created_by="system",
        note="Seeded from authored bundle files",
    )
    session.add(seed)
    await session.flush()
    return seed


def deploy_revision(revision: BundleRevision) -> None:
    """Swap the live runtime to this revision (immutable config, atomic reference swap)."""
    config = build_runtime_config(
        revision.plant_id,
        revision.bundle_json,
        bundle_rev=revision.rev,
        bundle_hash=revision.bundle_hash,
    )
    deploy_runtime_config(config)
    log.info("runtime_deployed", rev=revision.rev, bundle_hash=revision.bundle_hash[:12])


async def restore_latest_deployed(session: AsyncSession) -> int | None:
    """On startup, run the newest deployed revision (approved changes survive restarts)."""
    result = await session.execute(
        select(BundleRevision)
        .where(BundleRevision.deployed_at.is_not(None))
        .order_by(BundleRevision.rev.desc())
        .limit(1)
    )
    revision = result.scalar_one_or_none()
    if revision is None:
        return None
    deploy_revision(revision)
    return revision.rev


async def _create_revision(
    session: AsyncSession,
    *,
    bundle: dict[str, Any],
    parent_rev: int,
    principal: Principal,
    source_change_id: str | None,
    note: str,
) -> BundleRevision:
    max_rev = (await session.execute(select(func.max(BundleRevision.rev)))).scalar_one() or 0
    revision = BundleRevision(
        rev=max_rev + 1,
        plant_id=get_settings().active_plant_id,
        parent_rev=parent_rev,
        bundle_hash=bundle_hash(bundle),
        bundle_json=bundle,
        created_by=principal.subject,
        source_change_id=source_change_id,
        note=note,
        deployed_at=_now(),
        deployed_by=principal.subject,
    )
    session.add(revision)
    await session.flush()
    return revision


# --- Change requests ---------------------------------------------------------------------


def _preview(base: dict[str, Any], change_set: ChangeSet) -> dict[str, Any]:
    try:
        # Preview as the reviewer would see it with edges approved: it proves the change
        # would compile under the cycle policy once admitted to the runtime.
        after = apply_change_set(base, change_set, approve_edges=True)
    except ChangeSetError as exc:
        return {"applies": False, "error": str(exc), "diff": [], "validation": None}
    return {"applies": True, "error": None, "diff": entity_diff(base, after), "validation": validate_bundle(after)}


def serialize_change(row: ChangeRequest) -> dict[str, Any]:
    return {
        "change_id": row.id,
        "plant_id": row.plant_id,
        "title": row.title,
        "summary": row.summary,
        "source": row.source,
        "source_ref": row.source_ref,
        "status": row.status,
        "created_by": row.created_by,
        "created_by_role": row.created_by_role,
        "created_at": _iso(row.created_at) if row.created_at else None,
        "base_rev": row.base_rev,
        "change_set": row.change_set_json,
        "preview": row.preview_json,
        "reviewed_by": row.reviewed_by,
        "reviewed_at": _iso(row.reviewed_at) if row.reviewed_at else None,
        "review_comment": row.review_comment,
        "approve_edges": row.approve_edges,
        "result_rev": row.result_rev,
    }


async def submit_change(session: AsyncSession, change_set: ChangeSet, principal: Principal) -> ChangeRequest:
    base = await ensure_seed_revision(session)
    preview = _preview(base.bundle_json, change_set)
    row = ChangeRequest(
        plant_id=base.plant_id,
        title=change_set.title,
        summary=change_set.summary,
        source=change_set.source,
        source_ref=change_set.source_ref,
        status="pending",
        created_by=principal.subject,
        created_by_role=principal.role,
        base_rev=base.rev,
        change_set_json=change_set.model_dump(mode="json"),
        preview_json=preview,
        approve_edges=False,
    )
    session.add(row)
    await session.flush()
    await _audit_append(
        session,
        principal,
        "change.draft.create",
        "change_request",
        row.id,
        after={"title": row.title, "source": row.source, "source_ref": row.source_ref, "base_rev": base.rev,
               "ops": len(change_set.ops), "applies": preview["applies"],
               "valid": bool(preview.get("validation") and preview["validation"]["ok"])},
    )
    return row


async def list_changes(session: AsyncSession, status: str | None = None) -> list[ChangeRequest]:
    stmt = select(ChangeRequest).order_by(ChangeRequest.created_at.desc())
    if status:
        stmt = stmt.where(ChangeRequest.status == status)
    return list((await session.execute(stmt)).scalars())


async def get_change(session: AsyncSession, change_id: str) -> ChangeRequest:
    row = await session.get(ChangeRequest, change_id)
    if row is None:
        raise ChangePipelineError(404, f"Unknown change {change_id}")
    return row


async def review_change(
    session: AsyncSession,
    change_id: str,
    *,
    decision: str,
    comment: str,
    approve_edges: bool,
    principal: Principal,
) -> ChangeRequest:
    row = await get_change(session, change_id)
    if row.status != "pending":
        raise ChangePipelineError(409, f"Change is {row.status}, not pending")
    if not comment.strip():
        raise ChangePipelineError(422, "A review comment is required")
    settings = get_settings()
    if settings.change_require_distinct_reviewer and row.created_by == principal.subject:
        raise ChangePipelineError(403, "Four-eyes policy: the author cannot review their own change")

    def stamp() -> None:
        row.reviewed_by = principal.subject
        row.reviewed_at = _now()
        row.review_comment = comment.strip()

    if decision == "reject":
        stamp()
        row.status = "rejected"
        await _audit_append(session, principal, "change.review.reject", "change_request", row.id,
                            after={"status": "rejected"}, reason=row.review_comment)
        return row

    current = await ensure_seed_revision(session)
    if current.rev != row.base_rev:
        stamp()
        row.status = "stale"
        await _audit_append(session, principal, "change.review.stale", "change_request", row.id,
                            after={"base_rev": row.base_rev, "current_rev": current.rev},
                            reason="Drafted against an older revision; re-submit against the current one")
        await session.flush()
        raise ChangePipelineError(
            409,
            {"message": "Change was drafted against an older revision", "base_rev": row.base_rev,
             "current_rev": current.rev},
        )

    change_set = ChangeSet.model_validate(row.change_set_json)
    try:
        new_bundle = apply_change_set(current.bundle_json, change_set, approve_edges=approve_edges)
    except ChangeSetError as exc:
        raise ChangePipelineError(409, {"message": "Change no longer applies", "error": str(exc)}) from exc
    validation = validate_bundle(new_bundle)
    if not validation["ok"]:
        raise ChangePipelineError(422, {"message": "Resulting bundle fails validation", "validation": validation})

    stamp()
    revision = await _create_revision(
        session,
        bundle=new_bundle,
        parent_rev=current.rev,
        principal=principal,
        source_change_id=row.id,
        note=f"{row.title} (approved: {row.review_comment})",
    )
    row.status = "deployed"
    row.approve_edges = approve_edges
    row.result_rev = revision.rev
    await _audit_append(session, principal, "change.review.approve", "change_request", row.id,
                        after={"approve_edges": approve_edges, "result_rev": revision.rev}, reason=row.review_comment)
    await _audit_append(session, principal, "bundle.revision.create", "bundle_revision", str(revision.rev),
                        before={"rev": current.rev, "hash": current.bundle_hash},
                        after={"rev": revision.rev, "hash": revision.bundle_hash,
                               "graph_hash": validation["graph_hash"],
                               "feedback_loops": validation["feedback_loops"]})
    deploy_revision(revision)
    await _audit_append(session, principal, "runtime.deploy", "bundle_revision", str(revision.rev),
                        before={"rev": current.rev}, after={"rev": revision.rev, "hash": revision.bundle_hash})
    return row


async def rollback_to(session: AsyncSession, to_rev: int, *, comment: str, principal: Principal) -> BundleRevision:
    if not comment.strip():
        raise ChangePipelineError(422, "A rollback reason is required")
    target = await get_revision(session, to_rev)
    if target is None:
        raise ChangePipelineError(404, f"Unknown revision {to_rev}")
    current = await ensure_seed_revision(session)
    validation = validate_bundle(target.bundle_json)
    if not validation["ok"]:
        raise ChangePipelineError(422, {"message": "Target revision no longer validates", "validation": validation})
    revision = await _create_revision(
        session,
        bundle=target.bundle_json,
        parent_rev=current.rev,
        principal=principal,
        source_change_id=None,
        note=f"Rollback to r{to_rev}: {comment.strip()}",
    )
    deploy_revision(revision)
    await _audit_append(session, principal, "runtime.rollback", "bundle_revision", str(revision.rev),
                        before={"rev": current.rev}, after={"rev": revision.rev, "restored_from": to_rev},
                        reason=comment.strip())
    return revision


def active_runtime_info() -> dict[str, Any]:
    config = get_runtime_config()
    return {
        "plant_id": config.plant_id,
        "bundle_rev": config.bundle_rev,
        "bundle_hash": config.bundle_hash,
        "graph_id": config.graph_index.get("graph_id"),
        "source": "revision" if config.bundle_rev is not None else "files",
    }
