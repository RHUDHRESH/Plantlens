"""Offline ingestion gate issue and report models."""

from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.ingest.record import SourceRef

GateName = Literal["artifact_integrity", "canonical_schema", "industrial_truth"]
GateVerdict = Literal["pass", "warn", "fail", "skipped"]
GateSeverity = Literal["LOW", "MEDIUM", "HIGH", "BLOCKER"]


class GateIssue(BaseModel):
    """Single validation issue emitted by an ingestion gate."""

    model_config = ConfigDict(extra="forbid")

    code: str
    message: str
    severity: GateSeverity
    field: str | None = None
    fix: str | None = None
    source_ref: SourceRef | None = None

    @field_validator("code", "message")
    @classmethod
    def validate_non_empty(cls, value: str) -> str:
        if not value:
            raise ValueError("must not be empty")
        return value

    @model_validator(mode="after")
    def validate_high_severity_fix(self) -> Self:
        if self.severity in ("HIGH", "BLOCKER") and not self.fix:
            raise ValueError("fix must be non-empty when severity is HIGH or BLOCKER")
        return self


class GateReport(BaseModel):
    """Aggregated result for one ingestion gate."""

    model_config = ConfigDict(extra="forbid")

    gate_name: GateName
    verdict: GateVerdict
    accepted: int = Field(ge=0)
    rejected: int = Field(ge=0)
    issues: list[GateIssue] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_issues_present(self) -> Self:
        if self.verdict == "fail" and not self.issues:
            raise ValueError("issues must not be empty when verdict is fail")
        if self.rejected > 0 and not self.issues:
            raise ValueError("issues must not be empty when rejected > 0")
        return self