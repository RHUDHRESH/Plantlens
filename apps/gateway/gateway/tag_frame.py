"""TagFrame mirror for gateway process (matches packages/contracts/tag_frame.schema.json)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

TagQuality = Literal["GOOD", "UNCERTAIN", "BAD", "STALE", "MISSING"]
TagSource = Literal["simulator", "modbus_rtu", "modbus_tcp", "manual", "backfill"]
TagValue = float | str | bool | None


class TagFrame(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tag_id: str
    asset_id: str
    value: TagValue
    unit: str
    quality: TagQuality
    timestamp: datetime
    source: TagSource
    seq: int | None = Field(default=None, ge=0)
    gateway_id: str | None = None

    def model_dump_json(self, **kwargs) -> str:
        return super().model_dump_json(mode="json", **kwargs)