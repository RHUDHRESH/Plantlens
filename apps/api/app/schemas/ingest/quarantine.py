"""Offline ingestion quarantine record models."""

from typing import Any, Literal, Self

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.ingest.gates import GateName, GateSeverity
from app.schemas.ingest.record import SourceRef

QuarantineReason = Literal[
    "unsupported_file",
    "parse_failed",
    "schema_failed",
    "industrial_truth_failed",
    "ambiguous_mapping",
    "unsafe_suggestion",
    "duplicate_conflict",
    "manual_review_required",
]


class QuarantineRecord(BaseModel):
    """Row or artifact held back from draft creation pending human review."""

    model_config = ConfigDict(extra="forbid")

    quarantine_id: str
    run_id: str
    artifact_id: str
    raw_id: str | None = None
    record_id: str | None = None
    reason: QuarantineReason
    gate_name: GateName | None = None
    severity: GateSeverity
    message: str
    suggested_fix: str
    raw_snapshot: dict[str, Any] = Field(default_factory=dict)
    source_ref: SourceRef | None = None
    created_at_utc: AwareDatetime
    resolved_by: str | None = None
    resolved_at_utc: AwareDatetime | None = None
    resolution: str | None = None
    needs_human_review: bool = True

    @field_validator("quarantine_id")
    @classmethod
    def validate_quarantine_id_prefix(cls, value: str) -> str:
        if not value.startswith("qrn_"):
            raise ValueError("quarantine_id must start with qrn_")
        return value

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

    @field_validator("message", "suggested_fix")
    @classmethod
    def validate_non_empty(cls, value: str) -> str:
        if not value:
            raise ValueError("must not be empty")
        return value

    @model_validator(mode="after")
    def validate_quarantine_rules(self) -> Self:
        if not self.needs_human_review:
            raise ValueError("needs_human_review must be True for offline ingestion quarantine")
        if self.resolved_at_utc is not None:
            if not self.resolved_by or not self.resolution:
                raise ValueError(
                    "resolved_by and resolution must be set when resolved_at_utc is set"
                )
        return self