"""Offline ingestion draft contract models."""

from typing import Any, Literal, Self

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.ingest.record import SourceRef

DraftType = Literal[
    "asset_draft",
    "tag_draft",
    "register_map_draft",
    "alarm_rule_draft",
    "causal_edge_candidate",
    "action_envelope_draft",
    "scenario_seed_draft",
]
DraftStatus = Literal["pending", "rejected", "approved_later"]
DraftValidationStatus = Literal["pending", "valid", "invalid"]


class DraftContract(BaseModel):
    """Proposed authored config — never auto-applied to live runtime."""

    model_config = ConfigDict(extra="forbid")

    draft_id: str
    run_id: str
    draft_type: DraftType
    status: DraftStatus = "pending"
    source_artifact_ids: list[str]
    source_record_ids: list[str]
    payload: dict[str, Any]
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: list[str] = Field(default_factory=list)
    source_refs: list[SourceRef] = Field(default_factory=list)
    requires_human_approval: bool = True
    validation_status: DraftValidationStatus = "pending"
    created_at_utc: AwareDatetime
    created_by: str

    @field_validator("draft_id")
    @classmethod
    def validate_draft_id_prefix(cls, value: str) -> str:
        if not value.startswith("drf_"):
            raise ValueError("draft_id must start with drf_")
        return value

    @field_validator("run_id")
    @classmethod
    def validate_run_id_prefix(cls, value: str) -> str:
        if not value.startswith("run_"):
            raise ValueError("run_id must start with run_")
        return value

    @field_validator("source_artifact_ids")
    @classmethod
    def validate_source_artifact_ids(cls, value: list[str]) -> list[str]:
        if not value:
            raise ValueError("source_artifact_ids must not be empty")
        for artifact_id in value:
            if not artifact_id.startswith("art_"):
                raise ValueError("every source_artifact_id must start with art_")
        return value

    @field_validator("source_record_ids")
    @classmethod
    def validate_source_record_ids(cls, value: list[str]) -> list[str]:
        if not value:
            raise ValueError("source_record_ids must not be empty")
        return value

    @field_validator("payload")
    @classmethod
    def validate_payload_non_empty(cls, value: dict[str, Any]) -> dict[str, Any]:
        if not value:
            raise ValueError("payload must not be empty")
        return value

    @model_validator(mode="after")
    def enforce_human_approval(self) -> Self:
        if not self.requires_human_approval:
            raise ValueError("requires_human_approval must be True for offline ingestion drafts")
        return self