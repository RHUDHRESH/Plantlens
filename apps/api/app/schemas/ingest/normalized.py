"""Offline ingestion normalized canonical record models."""

from typing import Any, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.ingest.record import SourceRef

RecordKind = Literal[
    "tag_candidate",
    "register_map_candidate",
    "alarm_rule_candidate",
    "causal_edge_candidate",
]
SideKind = Literal["dc", "ac", "mechanical", "thermal", "unknown"]

_TAG_ID_PATTERN = r"^[A-Z0-9_]+$"
_ASSET_ID_PATTERN = r"^[A-Z0-9-]+$"


class NormalizedRecord(BaseModel):
    """Canonical candidate emitted after parsing and normalization."""

    model_config = ConfigDict(extra="forbid")

    record_id: str
    run_id: str
    artifact_id: str
    raw_id: str
    record_kind: RecordKind
    tag_id: str | None = Field(default=None, pattern=_TAG_ID_PATTERN)
    asset_id: str | None = Field(default=None, pattern=_ASSET_ID_PATTERN)
    asset_label: str | None = None
    signal_label: str | None = None
    unit: str | None = None
    side: SideKind | None = None
    signal_type: str | None = None
    register: dict[str, Any] | None = None
    fields: dict[str, Any] = Field(default_factory=dict)
    source_ref: SourceRef
    confidence: float = Field(ge=0.0, le=1.0)
    normalization_notes: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)

    @field_validator("record_id")
    @classmethod
    def validate_record_id_prefix(cls, value: str) -> str:
        if not value.startswith("nrm_"):
            raise ValueError("record_id must start with nrm_")
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

    @field_validator("raw_id")
    @classmethod
    def validate_raw_id_prefix(cls, value: str) -> str:
        if not value.startswith("raw_"):
            raise ValueError("raw_id must start with raw_")
        return value

    @model_validator(mode="after")
    def validate_tag_candidate_fields(self) -> Self:
        if self.record_kind == "tag_candidate":
            missing = [
                name
                for name, value in (
                    ("tag_id", self.tag_id),
                    ("asset_id", self.asset_id),
                    ("asset_label", self.asset_label),
                    ("signal_label", self.signal_label),
                    ("unit", self.unit),
                )
                if not value
            ]
            if missing:
                raise ValueError(
                    f"tag_candidate requires tag_id, asset_id, asset_label, signal_label, unit; "
                    f"missing: {', '.join(missing)}"
                )
        return self