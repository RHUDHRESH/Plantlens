"""Offline ingestion document-kind detection report models."""

from typing import Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.ingest.artifact import DocumentKind


class DetectionReport(BaseModel):
    """Transparent heuristic result for artifact document-kind classification."""

    model_config = ConfigDict(extra="forbid")

    artifact_id: str
    run_id: str
    document_kind: DocumentKind
    confidence: float = Field(ge=0.0, le=1.0)
    signals: list[str] = Field(default_factory=list)
    supported: bool
    reason: str | None = None
    needs_human_label: bool = False

    @field_validator("artifact_id")
    @classmethod
    def validate_artifact_id_prefix(cls, value: str) -> str:
        if not value.startswith("art_"):
            raise ValueError("artifact_id must start with art_")
        return value

    @field_validator("run_id")
    @classmethod
    def validate_run_id_prefix(cls, value: str) -> str:
        if not value.startswith("run_"):
            raise ValueError("run_id must start with run_")
        return value

    @model_validator(mode="after")
    def validate_detection_rules(self) -> Self:
        if not self.supported and not self.reason:
            raise ValueError("reason must be non-empty when supported is False")
        if self.document_kind == "unknown" and not self.needs_human_label:
            self.needs_human_label = True
        return self