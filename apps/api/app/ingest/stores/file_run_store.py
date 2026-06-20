"""File-backed per-run JSON storage for offline ingestion outputs."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.schemas.ingest.artifact import RawArtifact
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
    atomic_write_json,
    load_json,
    model_to_json,
    models_to_json,
    validate_model,
    validate_model_list,
)

RUN_FILES: dict[str, str] = {
    "artifact": "artifact.json",
    "raw_records": "raw_records.json",
    "normalized_records": "normalized_records.json",
    "mapping_candidates": "mapping_candidates.json",
    "gate_reports": "gate_reports.json",
    "quarantine": "quarantine.json",
    "drafts": "drafts.json",
    "report": "report.json",
}


class FileRunStore:
    """Per-run JSON outputs under {root}/runs/{run_id}/."""

    def __init__(self, root_dir: str | Path) -> None:
        self._root = Path(root_dir)
        self._runs_dir = self._root / "runs"
        self._index_path = self._runs_dir / "index.json"

    def create_run(
        self,
        run_id: str,
        *,
        triggered_by: str,
        plant_id: str | None = None,
    ) -> dict[str, Any]:
        run_dir = self._run_dir(run_id)
        manifest_path = run_dir / "manifest.json"
        if manifest_path.exists():
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
        run_dir.mkdir(parents=True, exist_ok=True)
        atomic_write_json(manifest_path, manifest)
        self._upsert_run_index(manifest)
        return manifest

    def save_artifact(self, run_id: str, artifact: RawArtifact) -> None:
        self._save_model(run_id, "artifact", artifact)

    def save_raw_records(self, run_id: str, records: list[RawRecord]) -> None:
        self._save_models(run_id, "raw_records", records)

    def save_normalized_records(self, run_id: str, records: list[NormalizedRecord]) -> None:
        self._save_models(run_id, "normalized_records", records)

    def save_mapping_candidates(self, run_id: str, records: list[MappingCandidate]) -> None:
        self._save_models(run_id, "mapping_candidates", records)

    def save_gate_reports(self, run_id: str, reports: list[GateReport]) -> None:
        self._save_models(run_id, "gate_reports", reports)

    def save_quarantine(self, run_id: str, records: list[QuarantineRecord]) -> None:
        self._save_models(run_id, "quarantine", records)

    def save_drafts(self, run_id: str, drafts: list[DraftContract]) -> None:
        self._save_models(run_id, "drafts", drafts)

    def save_report(self, run_id: str, report: IngestionRunReport) -> None:
        self._save_model(run_id, "report", report)

    def get_manifest(self, run_id: str) -> dict[str, Any]:
        manifest_path = self._run_dir(run_id) / "manifest.json"
        data = load_json(manifest_path)
        if not isinstance(data, dict):
            raise StoreIntegrityError(f"manifest for {run_id} must be a JSON object")
        return data

    def get_artifact(self, run_id: str) -> RawArtifact:
        return self._load_required_model(run_id, "artifact", RawArtifact)

    def get_raw_records(self, run_id: str) -> list[RawRecord]:
        return self._load_optional_list(run_id, "raw_records", RawRecord)

    def get_normalized_records(self, run_id: str) -> list[NormalizedRecord]:
        return self._load_optional_list(run_id, "normalized_records", NormalizedRecord)

    def get_mapping_candidates(self, run_id: str) -> list[MappingCandidate]:
        return self._load_optional_list(run_id, "mapping_candidates", MappingCandidate)

    def get_gate_reports(self, run_id: str) -> list[GateReport]:
        return self._load_optional_list(run_id, "gate_reports", GateReport)

    def get_quarantine(self, run_id: str) -> list[QuarantineRecord]:
        return self._load_optional_list(run_id, "quarantine", QuarantineRecord)

    def get_drafts(self, run_id: str) -> list[DraftContract]:
        return self._load_optional_list(run_id, "drafts", DraftContract)

    def get_report(self, run_id: str) -> IngestionRunReport:
        return self._load_required_model(run_id, "report", IngestionRunReport)

    def list_runs(self) -> list[dict[str, Any]]:
        if self._index_path.exists():
            data = load_json(self._index_path)
            if isinstance(data, list):
                return data
            raise StoreIntegrityError("runs/index.json must be a JSON list")

        if not self._runs_dir.exists():
            return []

        summaries: list[dict[str, Any]] = []
        for child in sorted(self._runs_dir.iterdir()):
            if not child.is_dir():
                continue
            manifest_path = child / "manifest.json"
            if manifest_path.exists():
                manifest = load_json(manifest_path)
                if isinstance(manifest, dict):
                    summaries.append(manifest)
        return summaries

    def _run_dir(self, run_id: str) -> Path:
        return self._runs_dir / run_id

    def _file_path(self, run_id: str, key: str) -> Path:
        filename = RUN_FILES[key]
        return self._run_dir(run_id) / filename

    def _save_model(self, run_id: str, key: str, model: RawArtifact | IngestionRunReport) -> None:
        path = self._file_path(run_id, key)
        atomic_write_json(path, model_to_json(model))
        self._update_manifest_file(run_id, key, RUN_FILES[key])

    def _save_models(self, run_id: str, key: str, models: list[Any]) -> None:
        path = self._file_path(run_id, key)
        atomic_write_json(path, models_to_json(models))
        self._update_manifest_file(run_id, key, RUN_FILES[key])

    def _update_manifest_file(self, run_id: str, key: str, filename: str) -> None:
        manifest_path = self._run_dir(run_id) / "manifest.json"
        manifest = self.get_manifest(run_id)
        files = manifest.setdefault("files", {})
        if not isinstance(files, dict):
            raise StoreIntegrityError(f"manifest.files for {run_id} must be a JSON object")
        files[key] = filename
        manifest["updated_at_utc"] = datetime.now(UTC).isoformat()
        atomic_write_json(manifest_path, manifest)

    def _load_required_model(
        self,
        run_id: str,
        key: str,
        model_cls: type[RawArtifact] | type[IngestionRunReport],
    ) -> Any:
        path = self._file_path(run_id, key)
        if not path.exists():
            raise StoreNotFoundError(f"{RUN_FILES[key]} not found for run {run_id}")
        data = load_json(path)
        return validate_model(model_cls, data, context=f"{RUN_FILES[key]} for {run_id}")

    def _load_optional_list(self, run_id: str, key: str, model_cls: type[Any]) -> list[Any]:
        path = self._file_path(run_id, key)
        if not path.exists():
            return []
        data = load_json(path)
        return validate_model_list(model_cls, data, context=f"{RUN_FILES[key]} for {run_id}")

    def _upsert_run_index(self, manifest: dict[str, Any]) -> None:
        index = self.list_runs() if self._index_path.exists() else []
        run_id = manifest["run_id"]
        index = [entry for entry in index if entry.get("run_id") != run_id]
        index.append(
            {
                "run_id": run_id,
                "triggered_by": manifest.get("triggered_by"),
                "plant_id": manifest.get("plant_id"),
                "created_at_utc": manifest.get("created_at_utc"),
                "updated_at_utc": manifest.get("updated_at_utc"),
            }
        )
        index.sort(key=lambda entry: str(entry.get("created_at_utc", "")))
        self._runs_dir.mkdir(parents=True, exist_ok=True)
        atomic_write_json(self._index_path, index)