"""In-memory store implementations for offline ingestion unit tests."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from app.schemas.ingest.artifact import RawArtifact, SourceChannel
from app.schemas.ingest.draft import DraftContract
from app.schemas.ingest.gates import GateReport
from app.schemas.ingest.mapping import MappingCandidate
from app.schemas.ingest.normalized import NormalizedRecord
from app.schemas.ingest.quarantine import QuarantineRecord
from app.schemas.ingest.record import RawRecord
from app.schemas.ingest.report import IngestionRunReport

from app.ingest.stores.base import (
    StoreError,
    StoreIntegrityError,
    StoreNotFoundError,
    validate_model,
)
from app.ingest.stores.file_run_store import RUN_FILES


class MemoryRawArtifactStore:
    """In-memory content-addressed raw artifact storage."""

    def __init__(self) -> None:
        self._bytes_by_sha: dict[str, bytes] = {}
        self._artifacts: dict[str, RawArtifact] = {}
        self._sha_index: dict[str, str] = {}

    def put_bytes(
        self,
        *,
        run_id: str,
        content: bytes,
        source_channel: SourceChannel,
        original_filename: str | None = None,
        mime_type: str | None = None,
        extension: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> RawArtifact:
        sha256 = hashlib.sha256(content).hexdigest()
        duplicate_of = self._sha_index.get(sha256)
        if sha256 not in self._bytes_by_sha:
            self._bytes_by_sha[sha256] = bytes(content)

        artifact_id = f"art_{uuid4()}"
        artifact = RawArtifact(
            artifact_id=artifact_id,
            run_id=run_id,
            received_at_utc=datetime.now(UTC),
            original_filename=original_filename,
            mime_type=mime_type,
            extension=extension,
            size_bytes=len(content),
            sha256=sha256,
            source_channel=source_channel,
            raw_uri=f"memory://raw/{sha256}",
            metadata=metadata or {},
            duplicate_of_artifact_id=duplicate_of,
        )
        self._artifacts[artifact_id] = artifact
        if sha256 not in self._sha_index:
            self._sha_index[sha256] = artifact_id
        return artifact

    def get_bytes(self, artifact: RawArtifact) -> bytes:
        content = self._bytes_by_sha.get(artifact.sha256)
        if content is None:
            raise StoreNotFoundError(f"Raw bytes not found for artifact {artifact.artifact_id}")
        digest = hashlib.sha256(content).hexdigest()
        if digest != artifact.sha256:
            raise StoreIntegrityError(
                f"SHA-256 mismatch for artifact {artifact.artifact_id}: "
                f"expected {artifact.sha256}, got {digest}"
            )
        return content

    def get_artifact(self, artifact_id: str) -> RawArtifact:
        artifact = self._artifacts.get(artifact_id)
        if artifact is None:
            raise StoreNotFoundError(f"Artifact not found: {artifact_id}")
        return validate_model(RawArtifact, artifact.model_dump(mode="json"), context=artifact_id)  # type: ignore[return-value]

    def artifact_exists_for_sha256(self, sha256: str) -> bool:
        return sha256 in self._sha_index

    def _tamper_bytes(self, sha256: str, content: bytes) -> None:
        """Test helper to simulate raw-byte corruption."""
        self._bytes_by_sha[sha256] = content


class MemoryRunStore:
    """In-memory per-run JSON storage."""

    def __init__(self) -> None:
        self._manifests: dict[str, dict[str, Any]] = {}
        self._artifact: dict[str, RawArtifact] = {}
        self._raw_records: dict[str, list[RawRecord]] = {}
        self._normalized_records: dict[str, list[NormalizedRecord]] = {}
        self._mapping_candidates: dict[str, list[MappingCandidate]] = {}
        self._gate_reports: dict[str, list[GateReport]] = {}
        self._quarantine: dict[str, list[QuarantineRecord]] = {}
        self._drafts: dict[str, list[DraftContract]] = {}
        self._reports: dict[str, IngestionRunReport] = {}

    def create_run(
        self,
        run_id: str,
        *,
        triggered_by: str,
        plant_id: str | None = None,
    ) -> dict[str, Any]:
        if run_id in self._manifests:
            raise StoreError(f"Run already exists: {run_id}")
        now = datetime.now(UTC).isoformat()
        manifest: dict[str, Any] = {
            "run_id": run_id,
            "triggered_by": triggered_by,
            "plant_id": plant_id,
            "created_at_utc": now,
            "updated_at_utc": now,
            "files": {},
        }
        self._manifests[run_id] = manifest
        return manifest

    def save_artifact(self, run_id: str, artifact: RawArtifact) -> None:
        self._require_run(run_id)
        self._artifact[run_id] = artifact
        self._touch_manifest(run_id, "artifact")

    def save_raw_records(self, run_id: str, records: list[RawRecord]) -> None:
        self._require_run(run_id)
        self._raw_records[run_id] = records
        self._touch_manifest(run_id, "raw_records")

    def save_normalized_records(self, run_id: str, records: list[NormalizedRecord]) -> None:
        self._require_run(run_id)
        self._normalized_records[run_id] = records
        self._touch_manifest(run_id, "normalized_records")

    def save_mapping_candidates(self, run_id: str, records: list[MappingCandidate]) -> None:
        self._require_run(run_id)
        self._mapping_candidates[run_id] = records
        self._touch_manifest(run_id, "mapping_candidates")

    def save_gate_reports(self, run_id: str, reports: list[GateReport]) -> None:
        self._require_run(run_id)
        self._gate_reports[run_id] = reports
        self._touch_manifest(run_id, "gate_reports")

    def save_quarantine(self, run_id: str, records: list[QuarantineRecord]) -> None:
        self._require_run(run_id)
        self._quarantine[run_id] = records
        self._touch_manifest(run_id, "quarantine")

    def save_drafts(self, run_id: str, drafts: list[DraftContract]) -> None:
        self._require_run(run_id)
        self._drafts[run_id] = drafts
        self._touch_manifest(run_id, "drafts")

    def save_report(self, run_id: str, report: IngestionRunReport) -> None:
        self._require_run(run_id)
        self._reports[run_id] = report
        self._touch_manifest(run_id, "report")

    def get_manifest(self, run_id: str) -> dict[str, Any]:
        manifest = self._manifests.get(run_id)
        if manifest is None:
            raise StoreNotFoundError(f"Run not found: {run_id}")
        return dict(manifest)

    def get_artifact(self, run_id: str) -> RawArtifact:
        artifact = self._artifact.get(run_id)
        if artifact is None:
            raise StoreNotFoundError(f"artifact.json not found for run {run_id}")
        return artifact

    def get_raw_records(self, run_id: str) -> list[RawRecord]:
        return list(self._raw_records.get(run_id, []))

    def get_normalized_records(self, run_id: str) -> list[NormalizedRecord]:
        return list(self._normalized_records.get(run_id, []))

    def get_mapping_candidates(self, run_id: str) -> list[MappingCandidate]:
        return list(self._mapping_candidates.get(run_id, []))

    def get_gate_reports(self, run_id: str) -> list[GateReport]:
        return list(self._gate_reports.get(run_id, []))

    def get_quarantine(self, run_id: str) -> list[QuarantineRecord]:
        return list(self._quarantine.get(run_id, []))

    def get_drafts(self, run_id: str) -> list[DraftContract]:
        return list(self._drafts.get(run_id, []))

    def get_report(self, run_id: str) -> IngestionRunReport:
        report = self._reports.get(run_id)
        if report is None:
            raise StoreNotFoundError(f"report.json not found for run {run_id}")
        return report

    def list_runs(self) -> list[dict[str, Any]]:
        return [
            {
                "run_id": manifest["run_id"],
                "triggered_by": manifest.get("triggered_by"),
                "plant_id": manifest.get("plant_id"),
                "created_at_utc": manifest.get("created_at_utc"),
                "updated_at_utc": manifest.get("updated_at_utc"),
            }
            for manifest in sorted(
                self._manifests.values(),
                key=lambda entry: str(entry.get("created_at_utc", "")),
            )
        ]

    def _require_run(self, run_id: str) -> None:
        if run_id not in self._manifests:
            raise StoreNotFoundError(f"Run not found: {run_id}")

    def _touch_manifest(self, run_id: str, key: str) -> None:
        manifest = self._manifests[run_id]
        files = manifest.setdefault("files", {})
        files[key] = RUN_FILES[key]
        manifest["updated_at_utc"] = datetime.now(UTC).isoformat()