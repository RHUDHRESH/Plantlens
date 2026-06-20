"""Offline ingestion raw artifact models."""

from typing import Any, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator

SourceChannel = Literal["upload", "paste", "api", "manual"]
DocumentKind = Literal[
    "signal_list",
    "register_map",
    "alarm_history",
    "cause_effect_matrix",
    "operator_note",
    "unknown",
]

_SHA256_PATTERN = r"^[a-f0-9]{64}$"


class RawArtifact(BaseModel):
    """Immutable stored input for offline authored-knowledge ingestion."""

    model_config = ConfigDict(extra="forbid")

    artifact_id: str
    run_id: str
    received_at_utc: AwareDatetime
    original_filename: str | None = None
    mime_type: str | None = None
    extension: str | None = None
    size_bytes: int = Field(ge=0)
    sha256: str = Field(pattern=_SHA256_PATTERN)
    source_channel: SourceChannel
    raw_uri: str
    document_kind: DocumentKind | None = None
    detection_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    detection_signals: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    duplicate_of_artifact_id: str | None = None

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

    @field_validator("raw_uri")
    @classmethod
    def validate_raw_uri_non_empty(cls, value: str) -> str:
        if not value:
            raise ValueError("raw_uri cannot be empty")
        return value

    @field_validator("duplicate_of_artifact_id")
    @classmethod
    def validate_duplicate_prefix(cls, value: str | None) -> str | None:
        if value is not None and not value.startswith("art_"):
            raise ValueError("duplicate_of_artifact_id must start with art_")
        return value