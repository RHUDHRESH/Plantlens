"""Offline ingestion mapping candidate models."""

from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.ingest.record import SourceRef

MappingTargetType = Literal[
    "asset",
    "tag",
    "alarm_rule",
    "causal_edge",
    "register_map",
    "action_envelope",
]
MappingIssue = Literal[
    "UNKNOWN_TAG",
    "UNKNOWN_ASSET",
    "AMBIGUOUS_SIGNAL",
    "DUPLICATE_TAG",
    "UNSAFE_SUGGESTION",
]
MappingStatus = Literal["OPEN", "RESOLVED", "REJECTED"]


class SuggestedMatch(BaseModel):
    """Registry similarity suggestion for an ambiguous mapping."""

    model_config = ConfigDict(extra="forbid")

    target_id: str
    label: str
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: list[str] = Field(default_factory=list)


class MappingCandidate(BaseModel):
    """Ambiguous or conflicting row queued for human resolution."""

    model_config = ConfigDict(extra="forbid")

    mapping_id: str
    run_id: str
    artifact_id: str
    source_record_id: str
    target_type: MappingTargetType
    issue: MappingIssue
    raw_value: str
    suggested_matches: list[SuggestedMatch] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)
    conflicts: list[str] = Field(default_factory=list)
    source_ref: SourceRef
    status: MappingStatus = "OPEN"
    needs_human_review: bool = True

    @field_validator("mapping_id")
    @classmethod
    def validate_mapping_id_prefix(cls, value: str) -> str:
        if not value.startswith("map_"):
            raise ValueError("mapping_id must start with map_")
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

    @model_validator(mode="after")
    def enforce_human_review(self) -> Self:
        if not self.needs_human_review:
            raise ValueError("needs_human_review must be True for offline ingestion mappings")
        return self