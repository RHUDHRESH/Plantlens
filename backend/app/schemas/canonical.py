"""Canonical value object + NE 107 device-health status enum (Domain C/V).

The canonical signal value is the universal currency above the SourceAdapter
boundary: nothing above sources/ ever sees a register number or node id.
"""
from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel


class NE107Status(StrEnum):
    """NAMUR NE 107 (Edition 2017-04-10) device self-diagnostic status.

    Diagnostic priority order (Endress+Hauser/Netilion):
      Failure = priority 1 (high severity)
      Function check = 2
      Maintenance required = 3
      Out of specification = 4
    """
    GOOD = "good"
    FAILURE = "failure"
    FUNCTION_CHECK = "function_check"
    OUT_OF_SPEC = "out_of_spec"
    MAINTENANCE_REQUIRED = "maintenance_required"


# Quality factor kappa used in Confidence(F) scoring (Domain E).
# Good = full credibility; uncertain = half; bad = none.
QUALITY_KAPPA: dict[str, float] = {
    NE107Status.GOOD.value: 1.0,
    NE107Status.MAINTENANCE_REQUIRED.value: 0.5,
    NE107Status.OUT_OF_SPEC.value: 0.5,
    NE107Status.FUNCTION_CHECK.value: 0.5,
    NE107Status.FAILURE.value: 0.0,
}


class Quality(StrEnum):
    """Coarse quality grade riding with every CanonicalValue."""
    GOOD = "good"
    UNCERTAIN = "uncertain"
    BAD = "bad"


class CanonicalValue(BaseModel):
    """A single canonical signal reading — the portability boundary currency."""
    instance_id: str
    signal_key: str
    value: Any  # float | list[float] | ndarray-like (composite stays as one payload)
    unit: str | None = None
    quality: Quality = Quality.GOOD
    ts: float  # unix epoch seconds
    source: str = "unknown"  # adapter id
