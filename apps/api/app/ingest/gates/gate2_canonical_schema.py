"""Gate 2 — canonical schema checks for normalized offline ingestion records."""

from __future__ import annotations

import re

from app.ingest.quarantine import quarantine_from_gate_issue
from app.schemas.ingest.gates import GateIssue, GateReport, GateVerdict
from app.schemas.ingest.normalized import NormalizedRecord
from app.schemas.ingest.quarantine import QuarantineRecord

_TAG_ID_PATTERN = re.compile(r"^[A-Z0-9_]+$")
_ASSET_ID_PATTERN = re.compile(r"^[A-Z0-9-]+$")


def run_gate2_canonical_schema(
    *,
    records: list[NormalizedRecord],
) -> tuple[GateReport, list[QuarantineRecord], list[NormalizedRecord]]:
    """Validate normalized records against canonical schema semantics."""
    if not records:
        report = GateReport(
            gate_name="canonical_schema",
            verdict="skipped",
            accepted=0,
            rejected=0,
            issues=[],
        )
        return report, [], []

    issues: list[GateIssue] = []
    quarantine: list[QuarantineRecord] = []
    clean_records: list[NormalizedRecord] = []
    rejected_ids: set[str] = set()

    for record in records:
        record_issues = _check_record(record)
        issues.extend(record_issues)
        blocking = [issue for issue in record_issues if _should_quarantine(issue)]
        if blocking:
            rejected_ids.add(record.record_id)
            for issue in blocking:
                quarantine.append(
                    quarantine_from_gate_issue(
                        run_id=record.run_id,
                        artifact_id=record.artifact_id,
                        issue=issue,
                        reason="schema_failed",
                        raw_id=record.raw_id,
                        record_id=record.record_id,
                        raw_snapshot=dict(record.fields),
                        gate_name="canonical_schema",
                    )
                )
        else:
            clean_records.append(record)

    verdict = _verdict(len(records), len(clean_records), issues)
    report = GateReport(
        gate_name="canonical_schema",
        verdict=verdict,
        accepted=len(clean_records),
        rejected=len(records) - len(clean_records),
        issues=issues,
    )
    return report, quarantine, clean_records


def _check_record(record: NormalizedRecord) -> list[GateIssue]:
    issues: list[GateIssue] = []

    if not record.record_id.startswith("nrm_"):
        issues.append(_issue("INVALID_RECORD_ID", "record_id must start with nrm_", "BLOCKER", record))
    if not record.artifact_id.startswith("art_"):
        issues.append(_issue("INVALID_ARTIFACT_ID", "artifact_id must start with art_", "BLOCKER", record))
    if not record.run_id.startswith("run_"):
        issues.append(_issue("INVALID_RUN_ID", "run_id must start with run_", "BLOCKER", record))
    if not record.raw_id.startswith("raw_"):
        issues.append(_issue("INVALID_RAW_ID", "raw_id must start with raw_", "BLOCKER", record))
    if record.confidence < 0.0 or record.confidence > 1.0:
        issues.append(_issue("INVALID_CONFIDENCE", "confidence must be between 0 and 1", "BLOCKER", record))
    if record.confidence < 0.50:
        issues.append(
            _issue(
                "LOW_CONFIDENCE_RECORD",
                "Record confidence is below 0.50.",
                "HIGH",
                record,
                fix="Review normalization evidence and correct the source row before approval.",
            )
        )

    if record.record_kind == "tag_candidate":
        issues.extend(_check_tag_candidate(record))
    elif record.record_kind == "register_map_candidate":
        issues.extend(_check_register_map_candidate(record))

    return issues


def _check_tag_candidate(record: NormalizedRecord) -> list[GateIssue]:
    issues: list[GateIssue] = []
    if not record.tag_id:
        issues.append(_issue("MISSING_TAG_ID", "tag_candidate requires tag_id", "BLOCKER", record, fix="Provide a canonical tag_id."))
    elif not _TAG_ID_PATTERN.fullmatch(record.tag_id):
        issues.append(_issue("INVALID_TAG_ID", f"Invalid tag_id {record.tag_id}", "BLOCKER", record, fix="Use uppercase letters, digits, and underscores only."))
    if not record.asset_id:
        issues.append(_issue("MISSING_ASSET_ID", "tag_candidate requires asset_id", "BLOCKER", record, fix="Provide a canonical asset_id."))
    elif not _ASSET_ID_PATTERN.fullmatch(record.asset_id):
        issues.append(_issue("INVALID_ASSET_ID", f"Invalid asset_id {record.asset_id}", "BLOCKER", record, fix="Use uppercase letters, digits, and hyphens only."))
    if not record.asset_label:
        issues.append(_issue("MISSING_ASSET_LABEL", "tag_candidate requires asset_label", "BLOCKER", record, fix="Provide the human asset label."))
    if not record.signal_label:
        issues.append(_issue("MISSING_SIGNAL_LABEL", "tag_candidate requires signal_label", "BLOCKER", record, fix="Provide the human signal label."))
    if not record.unit:
        issues.append(_issue("MISSING_UNIT", "tag_candidate requires unit", "HIGH", record, fix="Populate the engineering unit for this signal."))
    if record.side is None:
        issues.append(_issue("UNKNOWN_SIDE", "tag_candidate side is missing", "MEDIUM", record, fix="Set side to dc, ac, mechanical, thermal, or unknown."))
    elif record.side == "unknown":
        issues.append(_issue("UNKNOWN_SIDE", "tag_candidate side is unknown", "MEDIUM", record, fix="Confirm the electrical or physical side for this signal."))
    return issues


def _check_register_map_candidate(record: NormalizedRecord) -> list[GateIssue]:
    issues: list[GateIssue] = []
    if not record.tag_id:
        issues.append(_issue("MISSING_TAG_ID", "register_map_candidate requires tag_id", "BLOCKER", record, fix="Provide a canonical tag_id."))
    elif not _TAG_ID_PATTERN.fullmatch(record.tag_id):
        issues.append(_issue("INVALID_TAG_ID", f"Invalid tag_id {record.tag_id}", "BLOCKER", record, fix="Use uppercase letters, digits, and underscores only."))
    if record.register is None:
        issues.append(_issue("MISSING_REGISTER", "register_map_candidate requires register dict", "BLOCKER", record, fix="Provide register address, function code, and data type."))
    else:
        if not record.register.get("address"):
            issues.append(_issue("MISSING_REGISTER_ADDRESS", "register.address is required", "BLOCKER", record, fix="Provide a valid register address."))
        if not record.register.get("function_code"):
            issues.append(_issue("MISSING_FUNCTION_CODE", "register.function_code is required", "BLOCKER", record, fix="Provide a valid Modbus function code."))
        if not record.register.get("data_type"):
            issues.append(_issue("MISSING_DATA_TYPE", "register.data_type is required", "BLOCKER", record, fix="Provide a valid register data type."))
    if not record.unit:
        issues.append(_issue("MISSING_UNIT", "register_map_candidate unit is missing", "MEDIUM", record, fix="Provide a unit when the register represents an analog value."))
    return issues


def _should_quarantine(issue: GateIssue) -> bool:
    return issue.severity in {"HIGH", "BLOCKER"} or issue.code == "LOW_CONFIDENCE_RECORD"


def _issue(
    code: str,
    message: str,
    severity: str,
    record: NormalizedRecord,
    *,
    fix: str | None = None,
) -> GateIssue:
    return GateIssue(
        code=code,
        message=message,
        severity=severity,  # type: ignore[arg-type]
        field=code.lower(),
        fix=fix or "Correct the normalized record fields and re-run ingestion.",
        source_ref=record.source_ref,
    )


def _verdict(total: int, clean: int, issues: list[GateIssue]) -> GateVerdict:
    if total == 0:
        return "skipped"
    if clean == 0:
        return "fail"
    if clean < total or issues:
        return "warn"
    return "pass"