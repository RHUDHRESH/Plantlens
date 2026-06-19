"""Mirror of packages/contracts/tag_frame.schema.json."""

from datetime import datetime

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from app.schemas.common import TagQuality, TagSource, TagValue


class TagFrame(BaseModel):
    """Universal live telemetry envelope (simulator and gateway emit identical shape)."""

    model_config = ConfigDict(extra="forbid")

    tag_id: str = Field(pattern=r"^[A-Z0-9_]+$")
    asset_id: str = Field(pattern=r"^[A-Z0-9-]+$")
    value: TagValue
    unit: str
    quality: TagQuality
    timestamp: AwareDatetime
    source: TagSource
    seq: int | None = Field(default=None, ge=0)
    ingest_ts: AwareDatetime | None = None
    gateway_id: str | None = None
    scenario_id: str | None = None

    def identity_key(self) -> tuple[str, str, int | None, datetime]:
        """Dedupe key per contract: (source, tag_id, seq, timestamp)."""
        return (self.source, self.tag_id, self.seq, self.timestamp)