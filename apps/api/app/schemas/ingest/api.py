"""Request/response wrappers for future offline-ingest API routes."""

from typing import Any

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator

from app.schemas.ingest.artifact import DocumentKind
from app.schemas.ingest.draft import DraftContract
from app.schemas.ingest.report import RunStatus
from app.schemas.ingest.quarantine import QuarantineRecord


class OfflineTextIngestRequest(BaseModel):
    """Paste-based offline ingest trigger (router deferred to 1A.10)."""

    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1)
    filename: str | None = None
    plant_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class OfflineIngestStartResponse(BaseModel):
    """Immediate response after starting an offline ingest run."""

    model_config = ConfigDict(extra="forbid")

    run_id: str
    artifact_id: str
    status: RunStatus
    document_kind: DocumentKind | None = None

    @field_validator("run_id")
    @classmethod
    def validate_run_id_prefix(cls, value: str) -> str:
        if not value.startswith("run_"):
            raise ValueError("run_id must start with run_")
        return value

    @field_validator("artifact_id")
    @classmethod
    def validate_artifact_id_prefix(cls, value: str) -> str:
        if not value.startswith("art_"):
            raise ValueError("artifact_id must start with art_")
        return value


class OfflineRunSummary(BaseModel):
    """Lightweight run listing/detail shape for future GET /runs/{run_id}."""

    model_config = ConfigDict(extra="forbid")

    run_id: str
    artifact_ids: list[str]
    status: RunStatus
    started_at_utc: AwareDatetime
    completed_at_utc: AwareDatetime | None = None
    document_kind: DocumentKind | None = None

    @field_validator("run_id")
    @classmethod
    def validate_run_id_prefix(cls, value: str) -> str:
        if not value.startswith("run_"):
            raise ValueError("run_id must start with run_")
        return value


class OfflineDraftsResponse(BaseModel):
    """Draft contracts returned by future GET /runs/{run_id}/drafts."""

    model_config = ConfigDict(extra="forbid")

    drafts: list[DraftContract]


class OfflineQuarantineResponse(BaseModel):
    """Quarantine records returned by future GET /runs/{run_id}/quarantine."""

    model_config = ConfigDict(extra="forbid")

    quarantine: list[QuarantineRecord]


class ResolveQuarantineRequest(BaseModel):
    """Human resolution payload for future POST /runs/{run_id}/resolve-quarantine."""

    model_config = ConfigDict(extra="forbid")

    quarantine_id: str
    resolution: str
    patched_fields: dict[str, Any] = Field(default_factory=dict)

    @field_validator("quarantine_id")
    @classmethod
    def validate_quarantine_id_prefix(cls, value: str) -> str:
        if not value.startswith("qrn_"):
            raise ValueError("quarantine_id must start with qrn_")
        return value