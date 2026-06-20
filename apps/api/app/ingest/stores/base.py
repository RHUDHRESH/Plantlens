"""Offline ingestion store protocols, exceptions, and atomic I/O helpers."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any, Protocol, runtime_checkable

from pydantic import BaseModel, ValidationError

from app.schemas.ingest.artifact import RawArtifact, SourceChannel
from app.schemas.ingest.draft import DraftContract
from app.schemas.ingest.gates import GateReport
from app.schemas.ingest.mapping import MappingCandidate
from app.schemas.ingest.normalized import NormalizedRecord
from app.schemas.ingest.quarantine import QuarantineRecord
from app.schemas.ingest.record import RawRecord
from app.schemas.ingest.report import IngestionRunReport


class StoreError(Exception):
    """Base error for offline ingestion storage operations."""


class StoreNotFoundError(StoreError):
    """Requested storage object does not exist."""


class StoreIntegrityError(StoreError):
    """Stored bytes or JSON failed integrity or schema validation."""


def atomic_write_bytes(path: Path, content: bytes) -> None:
    """Write bytes atomically via temp file + os.replace."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_path, path)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise


def atomic_write_json(path: Path, payload: object) -> None:
    """Write JSON atomically with deterministic key ordering."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, sort_keys=True, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_path, path)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise


def load_json(path: Path) -> object:
    """Load JSON from disk."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise StoreNotFoundError(f"File not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise StoreIntegrityError(f"Invalid JSON at {path}") from exc


def validate_model(model_cls: type[BaseModel], data: object, *, context: str) -> BaseModel:
    """Validate loaded JSON through a Pydantic model."""
    try:
        return model_cls.model_validate(data)
    except ValidationError as exc:
        raise StoreIntegrityError(f"{context} failed schema validation") from exc


def validate_model_list(
    model_cls: type[BaseModel],
    data: object,
    *,
    context: str,
) -> list[BaseModel]:
    """Validate a JSON list through a Pydantic model."""
    if not isinstance(data, list):
        raise StoreIntegrityError(f"{context} must be a JSON list")
    try:
        return [model_cls.model_validate(item) for item in data]
    except ValidationError as exc:
        raise StoreIntegrityError(f"{context} failed schema validation") from exc


def model_to_json(model: BaseModel) -> dict[str, Any]:
    """Serialize a Pydantic model for deterministic JSON storage."""
    return model.model_dump(mode="json")


def models_to_json(models: list[BaseModel]) -> list[dict[str, Any]]:
    """Serialize a list of Pydantic models for JSON storage."""
    return [model_to_json(model) for model in models]


@runtime_checkable
class RawArtifactStore(Protocol):
    """Content-addressed immutable raw artifact storage."""

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
    ) -> RawArtifact: ...

    def get_bytes(self, artifact: RawArtifact) -> bytes: ...

    def get_artifact(self, artifact_id: str) -> RawArtifact: ...

    def artifact_exists_for_sha256(self, sha256: str) -> bool: ...


@runtime_checkable
class RunStore(Protocol):
    """Per-run JSON artifact storage for offline ingestion outputs."""

    def create_run(
        self,
        run_id: str,
        *,
        triggered_by: str,
        plant_id: str | None = None,
    ) -> dict[str, Any]: ...

    def save_artifact(self, run_id: str, artifact: RawArtifact) -> None: ...

    def save_raw_records(self, run_id: str, records: list[RawRecord]) -> None: ...

    def save_normalized_records(self, run_id: str, records: list[NormalizedRecord]) -> None: ...

    def save_mapping_candidates(self, run_id: str, records: list[MappingCandidate]) -> None: ...

    def save_gate_reports(self, run_id: str, reports: list[GateReport]) -> None: ...

    def save_quarantine(self, run_id: str, records: list[QuarantineRecord]) -> None: ...

    def save_drafts(self, run_id: str, drafts: list[DraftContract]) -> None: ...

    def save_report(self, run_id: str, report: IngestionRunReport) -> None: ...

    def get_manifest(self, run_id: str) -> dict[str, Any]: ...

    def get_artifact(self, run_id: str) -> RawArtifact: ...

    def get_raw_records(self, run_id: str) -> list[RawRecord]: ...

    def get_normalized_records(self, run_id: str) -> list[NormalizedRecord]: ...

    def get_mapping_candidates(self, run_id: str) -> list[MappingCandidate]: ...

    def get_gate_reports(self, run_id: str) -> list[GateReport]: ...

    def get_quarantine(self, run_id: str) -> list[QuarantineRecord]: ...

    def get_drafts(self, run_id: str) -> list[DraftContract]: ...

    def get_report(self, run_id: str) -> IngestionRunReport: ...

    def list_runs(self) -> list[dict[str, Any]]: ...