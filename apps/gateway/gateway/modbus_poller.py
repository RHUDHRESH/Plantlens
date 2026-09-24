"""Compatibility facade for the Modbus poll plan.

The poller was replaced by :mod:`gateway.modbus.batch_planner` (range merging, exception-02
splitting) and :mod:`gateway.modbus.scan_engine` (scan cycles, per-device backoff, read-only
guard). ``ModbusPoller`` (one task per register group on a pymodbus client) was removed on purpose:
it could not bound timeouts per device, and it is superseded by ``ScanEngine``.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from gateway.modbus.batch_planner import (
    DEFAULT_LIMITS,
    PlannedTag,
    PlannerLimits,
    ReadBlock,
    plan_blocks,
    tags_from_tag_map,
)

PollTag = PlannedTag
PollGroup = ReadBlock

__all__ = ["PollDiagnostics", "PollGroup", "PollTag", "build_poll_plan"]


@dataclass
class PollDiagnostics:
    """Legacy aggregate counters shape (still returned by ``/health``)."""

    last_good_read_ts: datetime | None = None
    error_count: int = 0
    crc_failures: int = 0
    reconnect_count: int = 0
    stale_tag_count: int = 0


def build_poll_plan(tag_map: dict[str, Any], *, limits: PlannerLimits = DEFAULT_LIMITS) -> list[ReadBlock]:
    """Return the merged read blocks for every Modbus source in *tag_map*."""
    sources, per_source = tags_from_tag_map(tag_map)
    blocks: list[ReadBlock] = []
    for source_id, tags in per_source.items():
        if tags:
            blocks.extend(plan_blocks(source_id, sources[source_id].unit_id, tags, limits=limits))
    return blocks
