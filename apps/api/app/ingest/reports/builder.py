"""Ingestion run report builder for offline authored-knowledge ingestion."""

from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime

from app.schemas.ingest.artifact import DocumentKind
from app.schemas.ingest.draft import DraftContract
from app.schemas.ingest.gates import GateReport
from app.schemas.ingest.mapping import MappingCandidate
from app.schemas.ingest.normalized import NormalizedRecord
from app.schemas.ingest.quarantine import QuarantineRecord
from app.schemas.ingest.record import RawRecord
from app.schemas.ingest.report import (
    ConfidenceDistribution,
    HumanAction,
    IngestionRunReport,
    IngestionTotals,
    RunStatus,
)


def build_ingestion_run_report(
    *,
    run_id: str,
    started_at_utc: datetime,
    artifact_ids: list[str],
    detected_document_types: list[DocumentKind],
    raw_records: list[RawRecord],
    normalized_records: list[NormalizedRecord],
    clean_records: list[NormalizedRecord],
    mapping_candidates: list[MappingCandidate],
    gate_reports: list[GateReport],
    quarantine: list[QuarantineRecord],
    drafts: list[DraftContract],
    triggered_by: str,
    plant_id: str | None = None,
    status: RunStatus | None = None,
    warnings: list[str] | None = None,
    errors: list[str] | None = None,
) -> IngestionRunReport:
    """Assemble an end-of-run summary for Studio human review."""
    completed_at_utc = datetime.now(UTC)
    if completed_at_utc < started_at_utc:
        completed_at_utc = started_at_utc
    report_warnings = list(warnings or [])
    report_errors = list(errors or [])

    report_warnings.extend(_gate_warn_summaries(gate_reports))

    manual_review_count = _manual_review_count(
        quarantine=quarantine,
        mapping_candidates=mapping_candidates,
    )

    totals = IngestionTotals(
        files_received=len(artifact_ids),
        total_records=len(raw_records),
        parsed_records=len(raw_records),
        normalized_records=len(normalized_records),
        mapped_records=len(mapping_candidates),
        drafts_created=len(drafts),
        quarantined_records=len(quarantine),
        manual_review_count=manual_review_count,
    )
    confidence_distribution = _confidence_distribution(normalized_records)
    human_actions = _human_actions(
        quarantine=quarantine,
        drafts=drafts,
        detected_document_types=detected_document_types,
        mapping_candidates=mapping_candidates,
    )
    downstream_ready = _downstream_ready_for_studio(
        errors=report_errors,
        drafts=drafts,
        quarantine=quarantine,
        gate_reports=gate_reports,
        mapping_candidates=mapping_candidates,
    )
    resolved_status = status or _resolve_status(
        errors=report_errors,
        quarantine=quarantine,
        gate_reports=gate_reports,
    )

    return IngestionRunReport(
        run_id=run_id,
        plant_id=plant_id,
        started_at_utc=started_at_utc,
        completed_at_utc=completed_at_utc,
        status=resolved_status,
        artifact_ids=artifact_ids,
        detected_document_types=detected_document_types,
        totals=totals,
        gate_results=gate_reports,
        confidence_distribution=confidence_distribution,
        human_actions_needed=human_actions,
        warnings=report_warnings,
        errors=report_errors,
        downstream_ready_for_studio=downstream_ready,
        triggered_by=triggered_by,
    )


def _manual_review_count(
    *,
    quarantine: list[QuarantineRecord],
    mapping_candidates: list[MappingCandidate],
) -> int:
    """Count unique human-review targets without double-counting mapped quarantine rows."""
    review_keys: set[str] = set()
    quarantine_record_ids: set[str] = set()
    quarantine_raw_ids: set[str] = set()

    for entry in quarantine:
        if entry.record_id:
            review_keys.add(f"record:{entry.record_id}")
            quarantine_record_ids.add(entry.record_id)
        elif entry.raw_id:
            review_keys.add(f"raw:{entry.raw_id}")
            quarantine_raw_ids.add(entry.raw_id)
        else:
            review_keys.add(f"quarantine:{entry.quarantine_id}")

    for candidate in mapping_candidates:
        if not candidate.needs_human_review or candidate.status != "OPEN":
            continue
        source_id = candidate.source_record_id
        if source_id in quarantine_record_ids or source_id in quarantine_raw_ids:
            continue
        review_keys.add(f"mapping:{candidate.mapping_id}")

    return len(review_keys)


def _confidence_distribution(records: list[NormalizedRecord]) -> ConfidenceDistribution:
    """Bucket confidence counts from normalized records before gate filtering."""
    high = medium = low = 0
    for record in records:
        if record.confidence >= 0.80:
            high += 1
        elif record.confidence >= 0.50:
            medium += 1
        else:
            low += 1
    return ConfidenceDistribution(high=high, medium=medium, low=low)


def _gate_warn_summaries(gate_reports: list[GateReport]) -> list[str]:
    summaries: list[str] = []
    for report in gate_reports:
        if report.verdict == "warn":
            issue_codes = ", ".join(issue.code for issue in report.issues)
            summaries.append(f"Gate {report.gate_name} warned: {issue_codes}")
    return summaries


def _human_actions(
    *,
    quarantine: list[QuarantineRecord],
    drafts: list[DraftContract],
    detected_document_types: list[DocumentKind],
    mapping_candidates: list[MappingCandidate],
) -> list[HumanAction]:
    actions: list[HumanAction] = []
    reason_counts = Counter(entry.reason for entry in quarantine)
    for reason, count in sorted(reason_counts.items()):
        actions.append(
            HumanAction(
                action_type="review_quarantine",
                message=f"Review {count} quarantined row(s) with reason {reason}.",
                target_id=reason,
            )
        )
    if drafts:
        actions.append(
            HumanAction(
                action_type="approve_draft",
                message=f"Review and approve {len(drafts)} draft contract(s) before applying.",
            )
        )
    if "unknown" in detected_document_types:
        actions.append(
            HumanAction(
                action_type="label_document_kind",
                message="Label the uploaded document kind before relying on parsers.",
            )
        )
    open_mappings = [candidate for candidate in mapping_candidates if candidate.status == "OPEN"]
    if open_mappings:
        actions.append(
            HumanAction(
                action_type="resolve_mapping",
                message=f"Resolve {len(open_mappings)} mapping candidate(s) requiring human review.",
            )
        )
    return actions


def _downstream_ready_for_studio(
    *,
    errors: list[str],
    drafts: list[DraftContract],
    quarantine: list[QuarantineRecord],
    gate_reports: list[GateReport],
    mapping_candidates: list[MappingCandidate],
) -> bool:
    if errors:
        return False
    if not drafts:
        return False
    if quarantine:
        return False
    if any(report.rejected > 0 for report in gate_reports):
        return False
    if any(report.verdict not in {"pass", "warn"} for report in gate_reports):
        return False
    if any(
        candidate.needs_human_review and candidate.status == "OPEN"
        for candidate in mapping_candidates
    ):
        return False
    return True


def _resolve_status(
    *,
    errors: list[str],
    quarantine: list[QuarantineRecord],
    gate_reports: list[GateReport],
) -> RunStatus:
    if errors:
        return "failed"
    if quarantine or any(report.rejected > 0 for report in gate_reports):
        return "partial"
    return "completed"