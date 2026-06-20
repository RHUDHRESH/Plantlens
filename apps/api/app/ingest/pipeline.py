"""Offline ingestion pipeline orchestrator."""

from __future__ import annotations

from datetime import UTC, datetime
from pydantic import BaseModel, ConfigDict

from app.ingest.adapters import CsvAdapter, XlsxAdapter
from app.ingest.detectors import detect_document_kind
from app.ingest.drafts import build_draft_contracts
from app.ingest.gates import (
    run_gate1_artifact_integrity,
    run_gate2_canonical_schema,
    run_gate3_industrial_truth,
)
from app.ingest.parsers import parse_register_map_records, parse_signal_list_records
from app.ingest.quarantine import create_quarantine_record
from app.ingest.reports import build_ingestion_run_report
from app.ingest.stores.base import RawArtifactStore, RunStore
from app.schemas.ingest.artifact import DocumentKind, RawArtifact, SourceChannel
from app.schemas.ingest.detection import DetectionReport
from app.schemas.ingest.draft import DraftContract
from app.schemas.ingest.gates import GateReport
from app.schemas.ingest.mapping import MappingCandidate
from app.schemas.ingest.normalized import NormalizedRecord
from app.schemas.ingest.quarantine import QuarantineRecord
from app.schemas.ingest.record import RawRecord
from app.schemas.ingest.report import IngestionRunReport, RunStatus

_ALLOWED_EXTENSIONS = {".csv", ".xlsx"}
_SUPPORTED_DOCUMENT_KINDS: dict[DocumentKind, str] = {
    "signal_list": "signal_list",
    "register_map": "register_map",
}
_UNIMPLEMENTED_DOCUMENT_KINDS = frozenset(
    {"alarm_history", "cause_effect_matrix", "operator_note"}
)


class OfflineIngestRunResult(BaseModel):
    """Full result of one offline ingestion cycle."""

    model_config = ConfigDict(extra="forbid")

    artifact: RawArtifact
    detection: DetectionReport
    raw_records: list[RawRecord]
    normalized_records: list[NormalizedRecord]
    mapping_candidates: list[MappingCandidate]
    gate_reports: list[GateReport]
    quarantine: list[QuarantineRecord]
    clean_records: list[NormalizedRecord]
    drafts: list[DraftContract]
    report: IngestionRunReport


def run_offline_ingest_cycle(
    *,
    run_id: str,
    content: bytes,
    source_channel: SourceChannel,
    original_filename: str | None,
    mime_type: str | None,
    extension: str | None,
    triggered_by: str,
    raw_store: RawArtifactStore,
    run_store: RunStore,
    plant_id: str | None = None,
    known_assets: dict[str, str] | None = None,
    known_tags: dict[str, str] | None = None,
) -> OfflineIngestRunResult:
    """Run the offline authored-knowledge ingestion pipeline end-to-end."""
    started_at_utc = datetime.now(UTC)
    warnings: list[str] = []
    errors: list[str] = []
    extra_quarantine: list[QuarantineRecord] = []

    run_store.create_run(run_id, triggered_by=triggered_by, plant_id=plant_id)
    artifact = raw_store.put_bytes(
        run_id=run_id,
        content=content,
        source_channel=source_channel,
        original_filename=original_filename,
        mime_type=mime_type,
        extension=extension,
    )
    run_store.save_artifact(run_id, artifact)

    adapter = _select_adapter(extension, mime_type)
    raw_records: list[RawRecord] = []
    normalized_records: list[NormalizedRecord] = []
    mapping_candidates: list[MappingCandidate] = []
    gate_reports: list[GateReport] = []
    quarantine: list[QuarantineRecord] = []
    clean_records: list[NormalizedRecord] = []
    drafts: list[DraftContract] = []

    if adapter is None:
        errors.append(f"Unsupported file type for offline ingestion: {extension or mime_type or 'unknown'}")
        detection = DetectionReport(
            artifact_id=artifact.artifact_id,
            run_id=run_id,
            document_kind="unknown",
            confidence=0.0,
            signals=["unsupported_extension"],
            supported=False,
            reason="File extension or MIME type is not supported for offline ingestion.",
            needs_human_label=True,
        )
        gate1_report, gate1_quarantine = run_gate1_artifact_integrity(
            artifact=artifact,
            raw_bytes=content,
            allowed_extensions=_ALLOWED_EXTENSIONS,
        )
        gate_reports = [gate1_report]
        quarantine = gate1_quarantine + [
            create_quarantine_record(
                run_id=run_id,
                artifact_id=artifact.artifact_id,
                reason="unsupported_file",
                severity="BLOCKER",
                message="Unsupported file type for offline ingestion.",
                suggested_fix="Upload a .csv or .xlsx authored-knowledge file.",
                gate_name="artifact_integrity",
            )
        ]
        report = _build_and_save_report(
            run_store=run_store,
            run_id=run_id,
            started_at_utc=started_at_utc,
            artifact=artifact,
            detection=detection,
            raw_records=raw_records,
            normalized_records=normalized_records,
            clean_records=clean_records,
            mapping_candidates=mapping_candidates,
            gate_reports=gate_reports,
            quarantine=quarantine,
            drafts=drafts,
            triggered_by=triggered_by,
            plant_id=plant_id,
            warnings=warnings,
            errors=errors,
            status="failed",
        )
        return OfflineIngestRunResult(
            artifact=artifact,
            detection=detection,
            raw_records=raw_records,
            normalized_records=normalized_records,
            mapping_candidates=mapping_candidates,
            gate_reports=gate_reports,
            quarantine=quarantine,
            clean_records=clean_records,
            drafts=drafts,
            report=report,
        )

    adapter_result = adapter.extract_records(artifact=artifact, content=content)
    raw_records = adapter_result.records
    warnings.extend(adapter_result.warnings)
    run_store.save_raw_records(run_id, raw_records)

    detection = detect_document_kind(
        artifact=artifact,
        records=raw_records,
        text=content.decode("utf-8", errors="replace"),
    )
    artifact = artifact.model_copy(
        update={
            "document_kind": detection.document_kind,
            "detection_confidence": detection.confidence,
            "detection_signals": detection.signals,
        }
    )
    run_store.save_artifact(run_id, artifact)

    gate1_report, gate1_quarantine = run_gate1_artifact_integrity(
        artifact=artifact,
        raw_bytes=content,
        raw_records=raw_records,
        allowed_extensions=_ALLOWED_EXTENSIONS,
    )
    gate_reports.append(gate1_report)
    quarantine.extend(gate1_quarantine)

    gate1_blocked = gate1_report.verdict == "fail"
    if not gate1_blocked:
        if detection.document_kind in _SUPPORTED_DOCUMENT_KINDS:
            normalized_records, mapping_candidates = _parse_records(
                document_kind=detection.document_kind,
                raw_records=raw_records,
                known_assets=known_assets,
                known_tags=known_tags,
            )
        else:
            parser_quarantine, parser_warnings = _manual_review_for_unparsed_kind(
                run_id=run_id,
                artifact=artifact,
                document_kind=detection.document_kind,
                raw_records=raw_records,
            )
            extra_quarantine.extend(parser_quarantine)
            warnings.extend(parser_warnings)
        run_store.save_normalized_records(run_id, normalized_records)
        run_store.save_mapping_candidates(run_id, mapping_candidates)

        gate2_report, gate2_quarantine, gate2_clean = run_gate2_canonical_schema(
            records=normalized_records
        )
        gate_reports.append(gate2_report)
        quarantine.extend(gate2_quarantine)

        gate3_report, gate3_quarantine, clean_records = run_gate3_industrial_truth(
            records=gate2_clean,
            mapping_candidates=mapping_candidates,
        )
        gate_reports.append(gate3_report)
        quarantine.extend(gate3_quarantine)
        quarantine.extend(extra_quarantine)

        drafts = build_draft_contracts(
            run_id=run_id,
            artifact_id=artifact.artifact_id,
            records=clean_records,
            quarantine=quarantine,
            created_by=triggered_by,
        )
        run_store.save_drafts(run_id, drafts)
    else:
        warnings.append("Gate 1 blocked downstream parsing and validation.")

    run_store.save_gate_reports(run_id, gate_reports)
    run_store.save_quarantine(run_id, quarantine)

    report = _build_and_save_report(
        run_store=run_store,
        run_id=run_id,
        started_at_utc=started_at_utc,
        artifact=artifact,
        detection=detection,
        raw_records=raw_records,
        normalized_records=normalized_records,
        clean_records=clean_records,
        mapping_candidates=mapping_candidates,
        gate_reports=gate_reports,
        quarantine=quarantine,
        drafts=drafts,
        triggered_by=triggered_by,
        plant_id=plant_id,
        warnings=warnings,
        errors=errors,
    )

    return OfflineIngestRunResult(
        artifact=artifact,
        detection=detection,
        raw_records=raw_records,
        normalized_records=normalized_records,
        mapping_candidates=mapping_candidates,
        gate_reports=gate_reports,
        quarantine=quarantine,
        clean_records=clean_records,
        drafts=drafts,
        report=report,
    )


def _select_adapter(extension: str | None, mime_type: str | None) -> CsvAdapter | XlsxAdapter | None:
    normalized_extension = _normalize_extension(extension)
    if normalized_extension == ".csv" or mime_type == "text/csv":
        return CsvAdapter()
    if (
        normalized_extension == ".xlsx"
        or mime_type == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ):
        return XlsxAdapter()
    return None


def _normalize_extension(extension: str | None) -> str | None:
    if not extension:
        return None
    value = extension.lower().strip()
    if not value.startswith("."):
        value = f".{value}"
    return value


def _parse_records(
    *,
    document_kind: DocumentKind,
    raw_records: list[RawRecord],
    known_assets: dict[str, str] | None,
    known_tags: dict[str, str] | None,
) -> tuple[list[NormalizedRecord], list[MappingCandidate]]:
    if document_kind == "signal_list":
        return parse_signal_list_records(
            records=raw_records,
            known_assets=known_assets,
            known_tags=known_tags,
        )
    if document_kind == "register_map":
        return parse_register_map_records(
            records=raw_records,
            known_assets=known_assets,
            known_tags=known_tags,
        )
    return [], []


def _manual_review_for_unparsed_kind(
    *,
    run_id: str,
    artifact: RawArtifact,
    document_kind: DocumentKind,
    raw_records: list[RawRecord],
) -> tuple[list[QuarantineRecord], list[str]]:
    quarantine: list[QuarantineRecord] = []
    warnings: list[str] = []

    if document_kind == "unknown":
        warnings.append("Document kind is unknown; parser skipped.")
        message = "Document kind is unknown and requires human labeling."
        suggested_fix = "Label the document kind and re-run ingestion."
    elif document_kind in _UNIMPLEMENTED_DOCUMENT_KINDS:
        warnings.append(f"Parser for {document_kind} is not implemented.")
        message = f"Parser for {document_kind} is not implemented in Chunk 1A.9."
        suggested_fix = message
    else:
        warnings.append(f"No parser available for document kind {document_kind}.")
        message = f"No parser available for document kind {document_kind}."
        suggested_fix = "Upload a supported signal list or register map file."

    for raw in raw_records:
        quarantine.append(
            create_quarantine_record(
                run_id=run_id,
                artifact_id=artifact.artifact_id,
                reason="manual_review_required",
                severity="MEDIUM",
                message=message,
                suggested_fix=suggested_fix,
                raw_id=raw.raw_id,
                gate_name="industrial_truth",
                source_ref=raw.source_ref,
            )
        )
    return quarantine, warnings


def _build_and_save_report(
    *,
    run_store: RunStore,
    run_id: str,
    started_at_utc: datetime,
    artifact: RawArtifact,
    detection: DetectionReport,
    raw_records: list[RawRecord],
    normalized_records: list[NormalizedRecord],
    clean_records: list[NormalizedRecord],
    mapping_candidates: list[MappingCandidate],
    gate_reports: list[GateReport],
    quarantine: list[QuarantineRecord],
    drafts: list[DraftContract],
    triggered_by: str,
    plant_id: str | None,
    warnings: list[str],
    errors: list[str],
    status: RunStatus | None = None,
) -> IngestionRunReport:
    detected_types = [detection.document_kind]
    report = build_ingestion_run_report(
        run_id=run_id,
        started_at_utc=started_at_utc,
        artifact_ids=[artifact.artifact_id],
        detected_document_types=detected_types,
        raw_records=raw_records,
        normalized_records=normalized_records,
        clean_records=clean_records,
        mapping_candidates=mapping_candidates,
        gate_reports=gate_reports,
        quarantine=quarantine,
        drafts=drafts,
        triggered_by=triggered_by,
        plant_id=plant_id,
        status=status,
        warnings=warnings,
        errors=errors,
    )
    run_store.save_report(run_id, report)
    return report