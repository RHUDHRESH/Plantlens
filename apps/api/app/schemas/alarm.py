"""Mirror of packages/contracts/alarm_rules.schema.json."""

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import AlarmOp, Severity


class AlarmCondition(BaseModel):
    """Alarm trigger condition (threshold or warning/critical band)."""

    model_config = ConfigDict(extra="forbid")

    op: AlarmOp
    threshold: float | None = None
    warning: float | None = None
    critical: float | None = None
    for_ms: int = Field(default=0, ge=0)


class AlarmRule(BaseModel):
    """Single deterministic alarm rule."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[A-Z0-9_]+$")
    tag: str
    severity: Severity
    condition: AlarmCondition
    message: str
    asset_id: str | None = None
    priority: int | None = Field(default=None, ge=1, le=4)
    deadband: float = Field(default=0, ge=0)
    delay_ms: int = Field(default=0, ge=0)
    latching: bool = False
    requires_ack: bool = False
    shelvable: bool = False
    max_shelve_seconds: int | None = None
    suggested_actions: list[str] | None = None


class AlarmRules(BaseModel):
    """Authored alarm rule bundle."""

    model_config = ConfigDict(extra="forbid")

    version: str
    rules: list[AlarmRule]