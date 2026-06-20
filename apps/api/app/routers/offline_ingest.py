"""Offline authored-knowledge ingestion API (draft-only, human-review path)."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.auth.dependencies import require_engineer, require_viewer
from app.auth.principal import Principal
from app.ingest.pipeline import run_offline_ingest_cycle
from app.ingest.stores import FileRawArtifactStore, FileRunStore, StoreError, StoreNotFoundError
from app.schemas.ingest.artifact import SourceChannel
from app.schemas.ingest.api import (
    OfflineDraftsResponse,
    OfflineIngestStartResponse,
    OfflineQuarantineResponse,
    OfflineRunSummary,
    OfflineTextIngestRequest,
)
from app.schemas.ingest.report import IngestionRunReport, RunStatus
from app.settings import Settings, get_settings

router = APIRouter(prefix="/api/offline-ingest", tags=["offline-ingest"])

# TODO(1A.11): POST /runs/{run_id}/resolve-quarantine
# TODO(1A.11): POST /runs/{run_id}/rerun


def get_offline_raw_store(settings: Settings = Depends(get_settings)) -> FileRawArtifactStore:
    return FileRawArtifactStore(settings.offline_ingest_data_dir)


def get_offline_run_store(settings: Settings = Depends(get_settings)) -> FileRunStore:
    return FileRunStore(settings.offline_ingest_data_dir)


def _triggered_by(principal: Principal) -> str:
    return principal.subject


def _looks_csv_like(text: str) -> bool:
    lines = [line.strip() for line in text.strip().splitlines() if line.strip()]
    if not lines:
        return False
    return any("," in line or "\t" in line for line in lines)


def _resolve_text_upload(
    request: OfflineTextIngestRequest,
) -> tuple[str, str | None, str | None]:
    if request.filename:
        filename = request.filename
        extension = Path(filename).suffix.lower() or None
        return filename, extension, "text/plain"

    if _looks_csv_like(request.text):
        return "pasted_text.csv", ".csv", "text/csv"
    return "pasted_text.txt", ".txt", "text/plain"


def _run_cycle(
    *,
    content: bytes,
    source_channel: SourceChannel,
    original_filename: str | None,
    mime_type: str | None,
    extension: str | None,
    triggered_by: str,
    plant_id: str | None,
    raw_store: FileRawArtifactStore,
    run_store: FileRunStore,
) -> OfflineIngestStartResponse:
    run_id = f"run_{uuid4()}"
    try:
        result = run_offline_ingest_cycle(
            run_id=run_id,
            content=content,
            source_channel=source_channel,
            original_filename=original_filename,
            mime_type=mime_type,
            extension=extension,
            triggered_by=triggered_by,
            raw_store=raw_store,
            run_store=run_store,
            plant_id=plant_id,
        )
    except StoreError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Offline ingest storage failed",
        ) from exc

    return OfflineIngestStartResponse(
        run_id=result.report.run_id,
        artifact_id=result.artifact.artifact_id,
        status=result.report.status,
        document_kind=result.detection.document_kind,
    )


def _require_run_manifest(run_store: FileRunStore, run_id: str) -> dict[str, object]:
    try:
        manifest = run_store.get_manifest(run_id)
    except StoreNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Run not found: {run_id}",
        ) from exc
    return manifest


def _run_summary_from_store(run_store: FileRunStore, run_id: str) -> OfflineRunSummary:
    manifest = _require_run_manifest(run_store, run_id)

    artifact_ids: list[str] = []
    document_kind = None
    run_status: RunStatus = "partial"
    started_at_utc: datetime | None = None
    completed_at_utc: datetime | None = None

    try:
        artifact = run_store.get_artifact(run_id)
        artifact_ids = [artifact.artifact_id]
        document_kind = artifact.document_kind
    except StoreNotFoundError:
        pass

    try:
        report = run_store.get_report(run_id)
        run_status = report.status
        started_at_utc = report.started_at_utc
        completed_at_utc = report.completed_at_utc
        if document_kind is None and report.detected_document_types:
            document_kind = report.detected_document_types[0]
        if not artifact_ids:
            artifact_ids = list(report.artifact_ids)
    except StoreNotFoundError:
        created_at = manifest.get("created_at_utc")
        if isinstance(created_at, str):
            started_at_utc = datetime.fromisoformat(created_at)

    if started_at_utc is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Run manifest is missing start timestamp",
        )

    return OfflineRunSummary(
        run_id=run_id,
        artifact_ids=artifact_ids,
        status=run_status,
        started_at_utc=started_at_utc,
        completed_at_utc=completed_at_utc,
        document_kind=document_kind,
    )


@router.post("/uploads", response_model=OfflineIngestStartResponse)
async def upload_offline_ingest(
    file: UploadFile = File(...),
    plant_id: str | None = Form(default=None),
    principal: Principal = Depends(require_engineer),
    raw_store: FileRawArtifactStore = Depends(get_offline_raw_store),
    run_store: FileRunStore = Depends(get_offline_run_store),
) -> OfflineIngestStartResponse:
    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Uploaded file is empty",
        )

    filename = file.filename or "upload.bin"
    extension = Path(filename).suffix.lower() or None
    return _run_cycle(
        content=content,
        source_channel="upload",
        original_filename=filename,
        mime_type=file.content_type,
        extension=extension,
        triggered_by=_triggered_by(principal),
        plant_id=plant_id,
        raw_store=raw_store,
        run_store=run_store,
    )


@router.post("/text", response_model=OfflineIngestStartResponse)
async def ingest_offline_text(
    request: OfflineTextIngestRequest,
    principal: Principal = Depends(require_engineer),
    raw_store: FileRawArtifactStore = Depends(get_offline_raw_store),
    run_store: FileRunStore = Depends(get_offline_run_store),
) -> OfflineIngestStartResponse:
    content = request.text.encode("utf-8")
    filename, extension, mime_type = _resolve_text_upload(request)
    return _run_cycle(
        content=content,
        source_channel="paste",
        original_filename=filename,
        mime_type=mime_type,
        extension=extension,
        triggered_by=_triggered_by(principal),
        plant_id=request.plant_id,
        raw_store=raw_store,
        run_store=run_store,
    )


@router.get("/runs/{run_id}", response_model=OfflineRunSummary)
async def get_run_summary(
    run_id: str,
    _principal: Principal = Depends(require_viewer),
    run_store: FileRunStore = Depends(get_offline_run_store),
) -> OfflineRunSummary:
    return _run_summary_from_store(run_store, run_id)


@router.get("/runs/{run_id}/report", response_model=IngestionRunReport)
async def get_run_report(
    run_id: str,
    _principal: Principal = Depends(require_viewer),
    run_store: FileRunStore = Depends(get_offline_run_store),
) -> IngestionRunReport:
    _require_run_manifest(run_store, run_id)
    try:
        return run_store.get_report(run_id)
    except StoreNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report not found for run: {run_id}",
        ) from exc


@router.get("/runs/{run_id}/drafts", response_model=OfflineDraftsResponse)
async def get_run_drafts(
    run_id: str,
    _principal: Principal = Depends(require_viewer),
    run_store: FileRunStore = Depends(get_offline_run_store),
) -> OfflineDraftsResponse:
    _require_run_manifest(run_store, run_id)
    return OfflineDraftsResponse(drafts=run_store.get_drafts(run_id))


@router.get("/runs/{run_id}/quarantine", response_model=OfflineQuarantineResponse)
async def get_run_quarantine(
    run_id: str,
    _principal: Principal = Depends(require_viewer),
    run_store: FileRunStore = Depends(get_offline_run_store),
) -> OfflineQuarantineResponse:
    _require_run_manifest(run_store, run_id)
    return OfflineQuarantineResponse(quarantine=run_store.get_quarantine(run_id))