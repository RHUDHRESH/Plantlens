"""Mirror of packages/contracts/runtime_evidence.schema.json."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

EvidenceRole = Literal[
    "first_signal",
    "supporting_signal",
    "downstream_effect",
    "rejected",
    "sensor_fault",
]


class EvidenceChainItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    order: int = Field(ge=1)
    tag_id: str | None = None
    asset_id: str
    signal_name: str | None = None
    observed_value: Any = None
    unit: str | None = None
    threshold: float | None = None
    comparator: str | None = None
    alarm_id: str
    first_seen_ts: AwareDatetime
    quality: str
    role: EvidenceRole
    explanation: str = ""


class CausalPathEdge(BaseModel):
    model_config = ConfigDict(extra="forbid")

    from_asset_id: str
    to_asset_id: str
    edge_id: str
    approved: bool
    lag_ms: tuple[int, int] | None = None
    observed_lag_ms: float | None = None
    relation_type: str
    explanation: str = ""


class RejectedCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    asset_id: str
    reason: str
    score: float
    missing_evidence: list[str] = Field(default_factory=list)
    contradicted_by: list[str] = Field(default_factory=list)


class RuntimeEvidencePacket(BaseModel):
    model_config = ConfigDict(extra="forbid")

    evidence_id: str
    plant_id: str
    ts: AwareDatetime
    runtime_bundle_version: str
    source_frame_ids: list[str]
    active_alarm_ids: list[str]
    grouped_alarm_ids: list[str]
    root_asset_id: str | None = None
    root_cause_candidate_id: str | None = None
    situation_id: str | None = None
    situation_type: str | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    confidence_reason: str
    evidence_chain: list[EvidenceChainItem]
    causal_path: list[CausalPathEdge]
    rejected_candidates: list[RejectedCandidate]
    stale_or_bad_tags: list[str]
    missing_tags: list[str]
    blocked_actions: list[dict[str, Any]]
    recommended_checks: list[dict[str, Any]]
    time_to_consequence: dict[str, Any] | None = None
    audit_receipt_id: str | None = None
    deterministic_trace_id: str