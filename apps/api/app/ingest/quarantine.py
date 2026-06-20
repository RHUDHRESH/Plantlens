"""Quarantine record builders for offline ingestion gates."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from app.schemas.ingest.gates import GateIssue, GateName, GateSeverity
from app.schemas.ingest.mapping import MappingCandidate
from app.schemas.ingest.quarantine import QuarantineReason, QuarantineRecord
from app.schemas.ingest.record import SourceRef

_MAPPING_REASONS: dict[str, QuarantineReason] = {
    "UNKNOWN_ASSET": "manual_review_required",
    "UNKNOWN_TAG": "ambiguous_mapping",
    "AMBIGUOUS_SIGNAL": "ambiguous_mapping",
    "DUPLICATE_TAG": "duplicate_conflict",
    "UNSAFE_SUGGESTION": "unsafe_suggestion",
}

_MAPPING_SEVERITY: dict[str, GateSeverity] = {
    "UNKNOWN_ASSET": "MEDIUM",
    "UNKNOWN_TAG": "MEDIUM",
    "AMBIGUOUS_SIGNAL": "MEDIUM",
    "DUPLICATE_TAG": "HIGH",
    "UNSAFE_SUGGESTION": "BLOCKER",
}


def create_quarantine_record(
    *,
    run_id: str,
    artifact_id: str,
    reason: QuarantineReason,
    severity: GateSeverity,
    message: str,
    suggested_fix: str,
    raw_id: str | None = None,
    record_id: str | None = None,
    gate_name: GateName | None = None,
    raw_snapshot: dict[str, Any] | None = None,
    source_ref: SourceRef | None = None,
) -> QuarantineRecord:
    """Create a quarantine record for human review."""
    return QuarantineRecord(
        quarantine_id=f"qrn_{uuid4()}",
        run_id=run_id,
        artifact_id=artifact_id,
        raw_id=raw_id,
        record_id=record_id,
        reason=reason,
        gate_name=gate_name,
        severity=severity,
        message=message,
        suggested_fix=suggested_fix,
        raw_snapshot=raw_snapshot or {},
        source_ref=source_ref,
        created_at_utc=datetime.now(UTC),
        needs_human_review=True,
    )


def quarantine_from_gate_issue(
    *,
    run_id: str,
    artifact_id: str,
    issue: GateIssue,
    reason: QuarantineReason,
    raw_id: str | None = None,
    record_id: str | None = None,
    raw_snapshot: dict[str, Any] | None = None,
    gate_name: GateName | None = None,
) -> QuarantineRecord:
    """Convert a gate issue into a quarantine record."""
    return create_quarantine_record(
        run_id=run_id,
        artifact_id=artifact_id,
        reason=reason,
        severity=issue.severity,
        message=issue.message,
        suggested_fix=issue.fix or "Review the flagged field and correct the source artifact.",
        raw_id=raw_id,
        record_id=record_id,
        gate_name=gate_name,
        raw_snapshot=raw_snapshot,
        source_ref=issue.source_ref,
    )


def quarantine_from_mapping_candidate(candidate: MappingCandidate) -> QuarantineRecord:
    """Convert a mapping candidate into a quarantine record."""
    reason = _MAPPING_REASONS.get(candidate.issue, "manual_review_required")
    severity = _MAPPING_SEVERITY.get(candidate.issue, "MEDIUM")
    suggested_fix = _mapping_suggested_fix(candidate)
    return create_quarantine_record(
        run_id=candidate.run_id,
        artifact_id=candidate.artifact_id,
        reason=reason,
        severity=severity,
        message=f"Mapping review required for {candidate.issue}: {candidate.raw_value}",
        suggested_fix=suggested_fix,
        raw_id=candidate.source_record_id if candidate.source_record_id.startswith("raw_") else None,
        record_id=candidate.source_record_id if candidate.source_record_id.startswith("nrm_") else None,
        gate_name="industrial_truth",
        raw_snapshot={
            "mapping_id": candidate.mapping_id,
            "source_record_id": candidate.source_record_id,
            "issue": candidate.issue,
            "raw_value": candidate.raw_value,
            "evidence": candidate.evidence,
            "conflicts": candidate.conflicts,
            "suggested_matches": [
                match.model_dump(mode="json") for match in candidate.suggested_matches
            ],
        },
        source_ref=candidate.source_ref,
    )


def _mapping_suggested_fix(candidate: MappingCandidate) -> str:
    if candidate.issue == "UNKNOWN_ASSET":
        return "Confirm the asset label and map it to the correct asset_id in Studio."
    if candidate.issue == "UNKNOWN_TAG":
        return "Confirm the tag hint/signal and map it to the correct canonical tag_id."
    if candidate.issue == "AMBIGUOUS_SIGNAL":
        return "Choose the correct tag mapping from the suggested matches or provide a new tag_id."
    if candidate.issue == "DUPLICATE_TAG":
        return "Resolve the duplicate tag_id conflict and keep only one canonical binding."
    if candidate.issue == "UNSAFE_SUGGESTION":
        return "Reject the unsafe suggestion and provide an approved industrial mapping."
    return "Review the mapping candidate and resolve it before draft approval."