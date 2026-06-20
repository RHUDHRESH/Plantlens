"""Draft contract builders for offline authored-knowledge ingestion."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from app.schemas.ingest.draft import DraftContract, DraftType
from app.schemas.ingest.normalized import NormalizedRecord
from app.schemas.ingest.quarantine import QuarantineRecord


def build_draft_contracts(
    *,
    run_id: str,
    artifact_id: str,
    records: list[NormalizedRecord],
    quarantine: list[QuarantineRecord] | None = None,
    created_by: str,
) -> list[DraftContract]:
    """Build human-approval-only draft contracts from clean normalized records."""
    quarantined_ids = {
        entry.record_id
        for entry in (quarantine or [])
        if entry.record_id is not None
    }
    drafts: list[DraftContract] = []
    for record in records:
        if record.record_id in quarantined_ids:
            continue
        draft = _build_draft_for_record(
            run_id=run_id,
            artifact_id=artifact_id,
            record=record,
            created_by=created_by,
        )
        if draft is not None:
            drafts.append(draft)
    return drafts


def build_tag_draft_payload(record: NormalizedRecord) -> dict[str, Any]:
    """Build a tag-map-compatible draft payload from a tag candidate."""
    return {
        "operation": "upsert_tag",
        "tag": {
            "tag_id": record.tag_id,
            "asset_id": record.asset_id,
            "asset_label": record.asset_label,
            "signal_label": record.signal_label,
            "unit": record.unit,
            "side": record.side,
            "signal_type": record.signal_type,
            "source": "offline_ingest",
            "source_ref": record.source_ref.model_dump(mode="json"),
        },
    }


def build_register_map_draft_payload(record: NormalizedRecord) -> dict[str, Any]:
    """Build a register-map-compatible draft payload from a register candidate."""
    return {
        "operation": "upsert_register_map",
        "register_map": {
            "tag_id": record.tag_id,
            "asset_id": record.asset_id,
            "signal_label": record.signal_label,
            "unit": record.unit,
            "register": record.register,
            "source": "offline_ingest",
            "source_ref": record.source_ref.model_dump(mode="json"),
        },
    }


def _build_draft_for_record(
    *,
    run_id: str,
    artifact_id: str,
    record: NormalizedRecord,
    created_by: str,
) -> DraftContract | None:
    draft_type: DraftType
    if record.record_kind == "tag_candidate":
        if not record.tag_id or not record.asset_id or not record.unit:
            return None
        payload = build_tag_draft_payload(record)
        draft_type = "tag_draft"
    elif record.record_kind == "register_map_candidate":
        if not record.tag_id or not record.register:
            return None
        payload = build_register_map_draft_payload(record)
        draft_type = "register_map_draft"
    else:
        return None

    return DraftContract(
        draft_id=f"drf_{uuid4()}",
        run_id=run_id,
        draft_type=draft_type,
        status="pending",
        source_artifact_ids=[artifact_id],
        source_record_ids=[record.record_id],
        payload=payload,
        confidence=record.confidence,
        evidence=_evidence_for_record(record),
        source_refs=[record.source_ref],
        requires_human_approval=True,
        validation_status="pending",
        created_at_utc=datetime.now(UTC),
        created_by=created_by,
    )


def _evidence_for_record(record: NormalizedRecord) -> list[str]:
    evidence = [
        f"offline_ingest:{record.record_kind}",
        f"confidence:{record.confidence:.2f}",
        f"artifact:{record.artifact_id}",
        f"raw:{record.raw_id}",
    ]
    if record.tag_id:
        evidence.append(f"tag_id:{record.tag_id}")
    if record.asset_id:
        evidence.append(f"asset_id:{record.asset_id}")
    if record.normalization_notes:
        evidence.extend(f"note:{note}" for note in record.normalization_notes)
    if record.warnings:
        evidence.extend(f"warning:{warning}" for warning in record.warnings)
    return evidence