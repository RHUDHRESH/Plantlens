"""Pydantic schemas for AI harness responses — every answer must cite evidence."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import AwareDatetime, BaseModel, Field


EvidenceRefType = Literal[
    "evidence_packet",
    "alarm",
    "signal",
    "edge",
    "situation",
    "rejected_candidate",
    "audit",
    "action",
    "tag",
]


class EvidenceRef(BaseModel):
    """A single citation from the deterministic evidence record."""

    ref_type: EvidenceRefType
    ref_id: str
    quote_or_value: str = ""
    timestamp: str | None = None


class AIResponse(BaseModel):
    """Structured response from the AI harness.

    Every response that is not a refusal or insufficient-evidence fallback
    MUST carry at least one evidence_ref. The harness enforces this.
    """

    response_id: str
    intent: str
    role: str
    summary: str
    answer: str
    evidence_refs: list[EvidenceRef] = Field(default_factory=list)
    cited_signals: list[str] = Field(default_factory=list)
    cited_alarms: list[str] = Field(default_factory=list)
    cited_assets: list[str] = Field(default_factory=list)
    cited_edges: list[str] = Field(default_factory=list)
    cited_audit_ids: list[str] = Field(default_factory=list)
    proposed_actions: list[dict[str, Any]] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0, default=0.0)
    requires_human_approval: bool = False
    created_at: str = ""
    draft_artifact: dict[str, Any] | None = None


class ProactiveCard(BaseModel):
    """Role-filtered proactive surface card generated from runtime tick output."""

    card_id: str
    card_type: Literal[
        "SITUATION_ACTIVE",
        "ROOT_CAUSE_CHANGED",
        "DATA_QUALITY_DEGRADED",
        "TIME_TO_CONSEQUENCE",
        "NEW_AGENT_DRAFT_AVAILABLE",
        "GRAPH_COMPILE_FAILED",
        "GATEWAY_STALE",
        "ROLE_SPECIFIC_NEXT_ACTION",
    ]
    priority: int = Field(ge=1, le=5)
    title: str
    summary: str
    evidence_refs: list[EvidenceRef] = Field(default_factory=list)
    target_asset_id: str | None = None
    role_visibility: list[str] = Field(default_factory=list)
    created_at: str
    expires_at: str | None = None
    audit_id: str | None = None
    dismissed: bool = False
    pinned: bool = False
