"""Gate 1 — artifact integrity checks for offline ingestion."""

from __future__ import annotations

import hashlib
import re

from app.ingest.quarantine import quarantine_from_gate_issue
from app.schemas.ingest.artifact import RawArtifact
from app.schemas.ingest.gates import GateIssue, GateReport, GateVerdict
from app.schemas.ingest.quarantine import QuarantineReason, QuarantineRecord
from app.schemas.ingest.record import RawRecord

_SHA256_PATTERN = re.compile(r"^[a-f0-9]{64}$")


def run_gate1_artifact_integrity(
    *,
    artifact: RawArtifact,
    raw_bytes: bytes | None = None,
    raw_records: list[RawRecord] | None = None,
    allowed_extensions: set[str] | None = None,
    max_size_bytes: int = 25 * 1024 * 1024,
) -> tuple[GateReport, list[QuarantineRecord]]:
    """Validate immutable artifact metadata and optional raw-byte consistency."""
    issues: list[GateIssue] = []
    quarantine: list[QuarantineRecord] = []

    if not _SHA256_PATTERN.fullmatch(artifact.sha256):
        issues.append(
            _issue(
                "INVALID_SHA256",
                "Artifact sha256 must be lowercase 64-character hex.",
                severity="BLOCKER",
                fix="Recompute the artifact hash and store the lowercase SHA-256 digest.",
            )
        )

    if not artifact.raw_uri:
        issues.append(
            _issue(
                "EMPTY_RAW_URI",
                "Artifact raw_uri cannot be empty.",
                severity="BLOCKER",
                fix="Persist the raw artifact bytes and set raw_uri to the content-addressed path.",
            )
        )

    if artifact.size_bytes < 0:
        issues.append(
            _issue(
                "SIZE_MISMATCH",
                "Artifact size_bytes must be non-negative.",
                severity="BLOCKER",
                fix="Set size_bytes to the actual byte length of the stored artifact.",
            )
        )

    if artifact.size_bytes > max_size_bytes:
        issues.append(
            _issue(
                "FILE_TOO_LARGE",
                f"Artifact size_bytes exceeds limit of {max_size_bytes} bytes.",
                severity="BLOCKER",
                fix="Split or trim the artifact so it is within the configured upload limit.",
            )
        )

    if allowed_extensions is not None and artifact.extension:
        extension = artifact.extension if artifact.extension.startswith(".") else f".{artifact.extension}"
        if extension.lower() not in {value.lower() for value in allowed_extensions}:
            issues.append(
                _issue(
                    "UNSUPPORTED_EXTENSION",
                    f"Artifact extension {extension} is not allowed.",
                    severity="BLOCKER",
                    fix="Upload a supported authored-knowledge file type for offline ingestion.",
                )
            )

    if raw_bytes is not None:
        digest = hashlib.sha256(raw_bytes).hexdigest()
        if digest != artifact.sha256:
            issues.append(
                _issue(
                    "HASH_MISMATCH",
                    "Stored raw bytes do not match artifact.sha256.",
                    severity="BLOCKER",
                    fix="Re-read the immutable raw store and verify the artifact hash before continuing.",
                )
            )
        if len(raw_bytes) != artifact.size_bytes:
            issues.append(
                _issue(
                    "SIZE_MISMATCH",
                    "Stored raw byte length does not match artifact.size_bytes.",
                    severity="BLOCKER",
                    fix="Update artifact.size_bytes to match the stored raw content length.",
                )
            )

    if raw_records is not None:
        if not raw_records and artifact.size_bytes > 0:
            issues.append(
                _issue(
                    "EMPTY_RECORD_SET",
                    "Artifact produced no raw records.",
                    severity="MEDIUM",
                    fix="Verify the file contains a header row and at least one data row.",
                )
            )
        for record in raw_records:
            if record.artifact_id != artifact.artifact_id:
                issues.append(
                    _issue(
                        "RAW_RECORD_ARTIFACT_MISMATCH",
                        f"RawRecord {record.raw_id} artifact_id does not match artifact.",
                        severity="BLOCKER",
                        fix="Ensure every extracted row references the same artifact_id.",
                        source_ref=record.source_ref,
                    )
                )
            if record.run_id != artifact.run_id:
                issues.append(
                    _issue(
                        "RAW_RECORD_RUN_MISMATCH",
                        f"RawRecord {record.raw_id} run_id does not match artifact.",
                        severity="BLOCKER",
                        fix="Ensure every extracted row references the same run_id.",
                        source_ref=record.source_ref,
                    )
                )
            if record.source_ref.artifact_sha256 != artifact.sha256:
                issues.append(
                    _issue(
                        "RAW_RECORD_HASH_MISMATCH",
                        f"RawRecord {record.raw_id} source_ref hash does not match artifact.sha256.",
                        severity="BLOCKER",
                        fix="Preserve the artifact SHA-256 in every row source_ref.",
                        source_ref=record.source_ref,
                    )
                )

    if artifact.duplicate_of_artifact_id:
        issues.append(
            _issue(
                "DUPLICATE_ARTIFACT",
                f"Artifact duplicates earlier content at {artifact.duplicate_of_artifact_id}.",
                severity="MEDIUM",
                fix="Confirm whether this duplicate upload should be reviewed or ignored.",
            )
        )

    if artifact.document_kind == "unknown":
        issues.append(
            _issue(
                "UNKNOWN_DOCUMENT_KIND",
                "Artifact document kind is unknown and may require human labeling.",
                severity="MEDIUM",
                fix="Label the document kind before relying on downstream parsers.",
            )
        )

    for issue in issues:
        if issue.severity == "BLOCKER":
            quarantine.append(
                quarantine_from_gate_issue(
                    run_id=artifact.run_id,
                    artifact_id=artifact.artifact_id,
                    issue=issue,
                    reason=_blocker_reason(issue.code),
                    gate_name="artifact_integrity",
                )
            )

    verdict = _verdict(issues)
    accepted = 1 if verdict in {"pass", "warn"} else 0
    rejected = 0 if accepted else 1
    report = GateReport(
        gate_name="artifact_integrity",
        verdict=verdict,
        accepted=accepted,
        rejected=rejected,
        issues=issues,
    )
    return report, quarantine


def _issue(
    code: str,
    message: str,
    *,
    severity: str,
    fix: str | None = None,
    field: str | None = None,
    source_ref=None,
) -> GateIssue:
    return GateIssue(
        code=code,
        message=message,
        severity=severity,  # type: ignore[arg-type]
        field=field,
        fix=fix,
        source_ref=source_ref,
    )


def _verdict(issues: list[GateIssue]) -> GateVerdict:
    if any(issue.severity == "BLOCKER" for issue in issues):
        return "fail"
    if issues:
        return "warn"
    return "pass"


def _blocker_reason(code: str) -> QuarantineReason:
    if code in {"UNSUPPORTED_EXTENSION", "FILE_TOO_LARGE", "INVALID_SHA256"}:
        return "unsupported_file"
    if code in {"HASH_MISMATCH", "SIZE_MISMATCH", "EMPTY_RECORD_SET"}:
        return "parse_failed"
    return "schema_failed"