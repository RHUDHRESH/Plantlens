"""Mirror of packages/contracts/calm_card.schema.json."""

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from app.schemas.common import Confidence, RiskLevel, Severity, TimeToConsequenceState


class CalmCardFirstSignal(BaseModel):
    """Earliest evidence — the thing that changed first."""

    model_config = ConfigDict(extra="forbid")

    alarm_id: str
    asset_id: str
    timestamp: AwareDatetime
    message: str
    tag_id: str | None = None
    value: float | bool | None = None
    unit: str | None = None


class CalmCardEvidenceItem(BaseModel):
    """Ordered item in the Calm Card evidence chain."""

    model_config = ConfigDict(extra="forbid")

    order: int = Field(ge=1)
    alarm_id: str
    asset_id: str
    message: str
    timestamp: AwareDatetime


class CalmCardRecommendedCheck(BaseModel):
    """Best-first-check action from the action envelope."""

    model_config = ConfigDict(extra="forbid")

    action_id: str
    label: str
    risk_level: RiskLevel
    requires_isolation: bool = False


class CalmCardBlockedAction(BaseModel):
    """Action blocked by safety envelope."""

    model_config = ConfigDict(extra="forbid")

    action_id: str
    label: str
    reason: str


class CalmCardTimeToConsequence(BaseModel):
    """Advisory Endsley-L3 projection (never on trip path)."""

    model_config = ConfigDict(extra="forbid")

    target_tag: str
    target_label: str
    state: TimeToConsequenceState
    seconds_low: float | None = None
    seconds_mid: float | None = None
    seconds_high: float | None = None
    confidence: float | None = None
    reason: str | None = None


class CalmCard(BaseModel):
    """Derived structured decision card from a Situation."""

    model_config = ConfigDict(extra="forbid")

    card_id: str
    situation_id: str
    title: str
    severity: Severity
    root_asset_id: str
    created_at: AwareDatetime
    evidence_chain: list[CalmCardEvidenceItem]
    recommended_first_check: CalmCardRecommendedCheck
    raw_alarm_count: int = Field(ge=0)
    operator_authority: str
    root_asset_name: str | None = None
    confidence: Confidence | None = None
    confidence_reason: str | None = None
    evidence_id: str | None = None
    audit_receipt_id: str | None = None
    first_signal: CalmCardFirstSignal | None = None
    why_it_matters: str | None = None
    blocked_actions: list[CalmCardBlockedAction] | None = None
    time_to_consequence: CalmCardTimeToConsequence | None = None
    raw_alarm_ids: list[str] | None = None