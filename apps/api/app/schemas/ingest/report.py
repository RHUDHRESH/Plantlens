"""Offline ingestion run report models."""

from typing import Literal, Self

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.ingest.artifact import DocumentKind
from app.schemas.ingest.gates import GateReport

RunStatus = Literal[
    "pending",
    "running",
    "completed",
    "failed",
    "partial",
]
HumanActionType = Literal[
    "review_quarantine",
    "approve_draft",
    "label_document_kind",
    "resolve_mapping",
]


class ConfidenceDistribution(BaseModel):
    """Bucketed confidence counts for normalized records."""

    model_config = ConfigDict(extra="forbid")

    high: int = Field(default=0, ge=0)
    medium: int = Field(default=0, ge=0)
    low: int = Field(default=0, ge=0)


class IngestionTotals(BaseModel):
    """Aggregate counters for one offline ingestion run."""

    model_config = ConfigDict(extra="forbid")

    files_received: int = Field(ge=0)
    total_records: int = Field(ge=0)
    parsed_records: int = Field(ge=0)
    normalized_records: int = Field(ge=0)
    mapped_records: int = Field(ge=0)
    drafts_created: int = Field(ge=0)
    quarantined_records: int = Field(ge=0)
    manual_review_count: int = Field(ge=0)


class HumanAction(BaseModel):
    """Action item surfaced to a human reviewer in Studio."""

    model_config = ConfigDict(extra="forbid")

    action_type: HumanActionType
    message: str
    target_id: str | None = None


class IngestionRunReport(BaseModel):
    """End-of-run summary for an offline authored-knowledge ingestion cycle."""

    model_config = ConfigDict(extra="forbid")

    run_id: str
    plant_id: str | None = None
    started_at_utc: AwareDatetime
    completed_at_utc: AwareDatetime | None = None
    status: RunStatus
    artifact_ids: list[str] = Field(default_factory=list)
    detected_document_types: list[DocumentKind] = Field(default_factory=list)
    totals: IngestionTotals
    gate_results: list[GateReport] = Field(default_factory=list)
    confidence_distribution: ConfidenceDistribution = Field(default_factory=ConfidenceDistribution)
    human_actions_needed: list[HumanAction] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    downstream_ready_for_studio: bool = Field(
        default=False,
        description=(
            "True when the run output is ready for human review in Studio — "
            "not approval for live runtime deployment."
        ),
    )
    triggered_by: str

    @field_validator("run_id")
    @classmethod
    def validate_run_id_prefix(cls, value: str) -> str:
        if not value.startswith("run_"):
            raise ValueError("run_id must start with run_")
        return value

    @model_validator(mode="after")
    def validate_run_report_rules(self) -> Self:
        if (
            self.completed_at_utc is not None
            and self.completed_at_utc < self.started_at_utc
        ):
            raise ValueError("completed_at_utc cannot be earlier than started_at_utc")
        if self.status == "failed" and not self.errors:
            raise ValueError("errors must not be empty when status is failed")
        return self