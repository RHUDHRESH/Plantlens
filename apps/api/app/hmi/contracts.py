"""Strict Pydantic contracts for operator-ready HMI projection output."""

from enum import StrEnum
from typing import Self

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator


class HMIBaseModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class HMIOverallStatus(StrEnum):
    HEALTHY = "healthy"
    WARNING = "warning"
    FAULT = "fault"
    OFFLINE = "offline"
    BLOCKED = "blocked"


class HMIAssetStatus(StrEnum):
    HEALTHY = "healthy"
    WARNING = "warning"
    FAULT = "fault"
    OFFLINE = "offline"


class HMISignalStatus(StrEnum):
    NORMAL = "normal"
    WARNING = "warning"
    FAULT = "fault"
    STALE = "stale"
    MISSING = "missing"


class HMISeverity(StrEnum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class SafetyLevel(StrEnum):
    OBSERVE = "observe"
    CAUTION = "caution"
    ISOLATE_BEFORE_TOUCH = "isolate_before_touch"
    STOP_REQUIRED = "stop_required"


class ExpectedRange(HMIBaseModel):
    min: float | None = None
    max: float | None = None

    @model_validator(mode="after")
    def validate_bounds(self) -> Self:
        if self.min is None and self.max is None:
            raise ValueError("at least one of min or max must be provided")
        if self.min is not None and self.max is not None and self.min > self.max:
            raise ValueError("min must be less than or equal to max")
        return self


class EvidenceItem(HMIBaseModel):
    evidence_id: str
    signal_id: str
    asset_id: str
    description: str
    observed_value: float | int | bool | str | None
    unit: str | None
    status: HMISignalStatus
    weight: float = Field(ge=0.0, le=1.0)
    timestamp: AwareDatetime | None = None


class SignalHMIState(HMIBaseModel):
    signal_id: str
    asset_id: str
    name: str
    value: float | int | bool | str | None
    unit: str
    status: HMISignalStatus
    expected_range: ExpectedRange | None = None
    evidence_weight: float = Field(ge=0.0, le=1.0)
    timestamp: AwareDatetime | None = None


class AssetHMIState(HMIBaseModel):
    asset_id: str
    name: str
    kind: str
    status: HMIAssetStatus
    health_score: float = Field(ge=0.0, le=100.0)
    primary_signals: list[str] = Field(default_factory=list)
    active_faults: list[str] = Field(default_factory=list)
    downstream_impacts: list[str] = Field(default_factory=list)


class RootCauseCandidate(HMIBaseModel):
    cause_id: str
    title: str
    asset_id: str
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: list[EvidenceItem] = Field(default_factory=list)
    rejected_alternatives: list[str] = Field(default_factory=list)


class IncidentHMIState(HMIBaseModel):
    incident_id: str
    severity: HMISeverity
    title: str
    summary: str
    suspected_root_cause: str
    confidence: float = Field(ge=0.0, le=1.0)
    started_at: AwareDatetime
    affected_assets: list[str] = Field(default_factory=list)
    primary_alarms: list[str] = Field(default_factory=list)
    secondary_symptoms: list[str] = Field(default_factory=list)
    evidence: list[EvidenceItem] = Field(default_factory=list)


class OperatorAction(HMIBaseModel):
    priority: int = Field(ge=1)
    title: str
    instruction: str
    safety_level: SafetyLevel
    target_asset_id: str | None = None
    rationale: str


class AlarmGroup(HMIBaseModel):
    group_id: str
    title: str
    severity: HMISeverity
    root_alarm: str | None = None
    grouped_alarms: list[str] = Field(default_factory=list)
    suppressed_duplicates: list[str] = Field(default_factory=list)


class DataQualityState(HMIBaseModel):
    missing_signals: list[str] = Field(default_factory=list)
    stale_signals: list[str] = Field(default_factory=list)
    confidence_penalty: float = Field(ge=0.0, le=1.0, default=0.0)
    notes: list[str] = Field(default_factory=list)


class CausalityEdgeHMI(HMIBaseModel):
    edge_id: str
    from_asset_id: str
    to_asset_id: str
    relation: str
    active: bool = False


class PlantHMIState(HMIBaseModel):
    plant_id: str
    run_id: str
    generated_at: AwareDatetime
    overall_status: HMIOverallStatus
    active_incident: IncidentHMIState | None = None
    assets: list[AssetHMIState] = Field(default_factory=list)
    signals: list[SignalHMIState] = Field(default_factory=list)
    causality_edges: list[CausalityEdgeHMI] = Field(default_factory=list)
    root_cause_candidates: list[RootCauseCandidate] = Field(default_factory=list)
    operator_actions: list[OperatorAction] = Field(default_factory=list)
    alarm_groups: list[AlarmGroup] = Field(default_factory=list)
    suppressed_symptoms: list[str] = Field(default_factory=list)
    data_quality: DataQualityState


class HMIPreviewRequest(HMIBaseModel):
    """Request body for deterministic HMI preview projection."""

    canonical_payload: dict
    gate_results: list[dict] | dict | None = None
    generated_at: AwareDatetime | None = None