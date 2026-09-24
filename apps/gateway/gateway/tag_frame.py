"""TagFrame mirror for the gateway process.

Matches ``packages/contracts/tag_frame.schema.json`` and ``apps/api/app/schemas/tag_frame.py``
field for field (rule R3): id patterns, timezone-aware timestamps, optional ``ingest_ts`` and
``scenario_id``, and the closed ``source`` enum. The gateway adds two fail-closed checks that the
contract implies but JSON Schema cannot express:

* non-finite floats (NaN/Inf) are not representable in JSON and are rejected;
* ``quality="GOOD"`` must carry a value (``null`` is only valid with a non-GOOD quality).
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

TagQuality = Literal["GOOD", "UNCERTAIN", "BAD", "STALE", "MISSING"]
TagSource = Literal["simulator", "modbus_rtu", "modbus_tcp", "serial_line", "manual", "backfill"]
TagValue = float | str | bool | None

TAG_ID_PATTERN = r"^[A-Z0-9_]+$"
ASSET_ID_PATTERN = r"^[A-Z0-9-]+$"
_OPTIONAL_FIELDS = ("seq", "ingest_ts", "gateway_id", "scenario_id")


class TagFrame(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tag_id: str = Field(pattern=TAG_ID_PATTERN)
    asset_id: str = Field(pattern=ASSET_ID_PATTERN)
    value: TagValue
    unit: str
    quality: TagQuality
    timestamp: AwareDatetime
    source: TagSource
    seq: int | None = Field(default=None, ge=0)
    ingest_ts: AwareDatetime | None = None
    gateway_id: str | None = None
    scenario_id: str | None = None

    @model_validator(mode="after")
    def _fail_closed(self) -> TagFrame:
        if isinstance(self.value, float) and not math.isfinite(self.value):
            msg = "non-finite value is not representable in the TagFrame contract"
            raise ValueError(msg)
        if self.quality == "GOOD" and self.value is None:
            msg = "GOOD quality requires a value; use BAD/STALE/MISSING for null"
            raise ValueError(msg)
        return self

    def identity_key(self) -> tuple[str, str, int | None, datetime]:
        return (self.source, self.tag_id, self.seq, self.timestamp)

    def to_contract(self) -> dict[str, Any]:
        """JSON-ready dict that validates against the JSON schema.

        The schema types optional fields as plain strings/integers (no ``null``), so optional
        fields that are unset are omitted. ``value`` is required and is kept even when ``None``.
        """
        data = self.model_dump(mode="json")
        for key in _OPTIONAL_FIELDS:
            if data.get(key) is None:
                data.pop(key, None)
        return data
