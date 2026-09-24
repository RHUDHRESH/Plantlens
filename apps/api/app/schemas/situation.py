"""Mirror of packages/contracts/situation.schema.json."""

from pydantic import AwareDatetime, BaseModel, ConfigDict

from app.schemas.common import Confidence, EvidenceRole, Severity


class SituationEvidence(BaseModel):
    """Time-ordered evidence item within a Situation."""

    model_config = ConfigDict(extra="forbid")

    alarm_id: str
    asset_id: str
    timestamp: AwareDatetime
    reason: str
    role: EvidenceRole = "evidence"


class RejectedCandidateItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    asset_id: str
    reason: str
    score: float
    missing_evidence: list[str] | None = None
    contradicted_by: list[str] | None = None


class ScoreBreakdown(BaseModel):
    """Root-score components (docs/ALGORITHMS.md §3)."""

    model_config = ConfigDict(extra="forbid")

    timing: float
    coverage: float
    fingerprint: float
    quality_penalty: float
    contradictions: int
    margin: float
    competitor: str | None = None


class Situation(BaseModel):
    """Derived root-cause situation grouping raw alarms."""

    model_config = ConfigDict(extra="forbid")

    situation_id: str
    situation_type: str
    title: str
    severity: Severity
    root_asset_id: str
    created_at: AwareDatetime
    grouped_alarm_ids: list[str]
    evidence: list[SituationEvidence]
    root_asset_name: str | None = None
    confidence: Confidence | None = None
    confidence_score: float | None = None
    confidence_reason: str | None = None
    deterministic_trace_id: str | None = None
    rejected_candidates: list[RejectedCandidateItem] | None = None
    affected_asset_ids: list[str] | None = None
    causal_path: list[str] | None = None
    traversed_edges: list[str] | None = None
    score_breakdown: ScoreBreakdown | None = None
    loop_note: str | None = None
    unexplained_alarm_ids: list[str] | None = None