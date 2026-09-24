"""Modbus read planner: merge tags into as few contiguous reads as the protocol allows.

Tags are sorted by (source, unit, function, address) and merged while the gap to the next tag is
``<= max_gap`` registers and the resulting span stays within the protocol limit (125 registers
for FC03/04, 2000 bits for FC01/02). Duplicate addresses share a read.

When a device answers a merged block with exception 02 (illegal data address) it usually means
the gap contains unmapped registers. :meth:`BatchPlanner.split` then forces a block boundary at
the middle tag and remembers it for all later scans; a single-tag block that still answers 02 is
marked unreadable (its tags are published BAD) instead of being retried forever.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

from gateway.modbus.guard import BIT_FUNCTIONS, MAX_BITS, MAX_REGISTERS, TABLE_TO_FUNCTION, ReadRequest

MODBUS_PROTOCOLS = {"modbus_rtu", "modbus_tcp"}


@dataclass(frozen=True, slots=True)
class PlannedTag:
    tag_id: str
    asset_id: str
    unit: str
    address: int  # zero-based PDU address
    width: int
    table: str
    codec: str
    scale: float = 1.0
    offset: float = 0.0
    stale_after_ms: int = 1500

    @property
    def end(self) -> int:
        return self.address + self.width


@dataclass(frozen=True, slots=True)
class ReadBlock:
    source_id: str
    unit_id: int
    function: int
    start: int
    count: int
    tags: tuple[PlannedTag, ...]

    @property
    def key(self) -> tuple[str, int, int, int]:
        return (self.source_id, self.unit_id, self.function, self.start)

    def request(self) -> ReadRequest:
        return ReadRequest(unit=self.unit_id, function=self.function, address=self.start, count=self.count)

    # legacy PollGroup-compatible names
    @property
    def slave_id(self) -> int:
        return self.unit_id

    @property
    def start_address(self) -> int:
        return self.start


@dataclass(frozen=True, slots=True)
class SourceSpec:
    source_id: str
    protocol: str
    poll_ms: int
    unit_id: int
    address_base: int
    raw: dict[str, Any] = field(hash=False, compare=False, default_factory=dict)

    @property
    def serial(self) -> dict[str, Any]:
        return dict(self.raw.get("serial", {}))


@dataclass(frozen=True, slots=True)
class PlannerLimits:
    max_gap: int = 8
    max_registers: int = MAX_REGISTERS
    max_bits: int = MAX_BITS


DEFAULT_LIMITS = PlannerLimits()


def function_for_table(table: str) -> int:
    try:
        return TABLE_TO_FUNCTION[table.lower()]
    except KeyError as exc:
        raise ValueError(f"unknown register table {table!r}") from exc


def load_sources(tag_map: dict[str, Any]) -> dict[str, SourceSpec]:
    out: dict[str, SourceSpec] = {}
    for src in tag_map.get("sources", []):
        if src.get("protocol") not in MODBUS_PROTOCOLS:
            continue
        serial_cfg = src.get("serial", {})
        out[src["source_id"]] = SourceSpec(
            source_id=src["source_id"],
            protocol=src["protocol"],
            poll_ms=int(src.get("poll_ms", 250)),
            unit_id=int(src.get("unit_id", serial_cfg.get("slave_id", 1))),
            address_base=int(src.get("address_base", serial_cfg.get("address_base", 0))),
            raw=src,
        )
    return out


def _resolve_source(entry: dict[str, Any], all_sources: dict[str, dict[str, Any]], modbus: dict[str, SourceSpec]) -> SourceSpec | None:
    reg = entry.get("register") or {}
    explicit = reg.get("source_id") or entry.get("source_id")
    if explicit in modbus:
        return modbus[explicit]
    # Register-backed tags owned by the simulator source are served by the first Modbus source
    # (the demo bench wires the simulator's register table to real hardware).
    if all_sources.get(explicit or "", {}).get("protocol") == "simulator" and modbus:
        return next(iter(modbus.values()))
    return None


def tags_from_tag_map(tag_map: dict[str, Any]) -> tuple[dict[str, SourceSpec], dict[str, list[PlannedTag]]]:
    """Return (modbus sources, planned tags per source_id)."""
    all_sources = {s["source_id"]: s for s in tag_map.get("sources", [])}
    modbus = load_sources(tag_map)
    per_source: dict[str, list[PlannedTag]] = {sid: [] for sid in modbus}
    for entry in tag_map.get("tags", []):
        reg = entry.get("register")
        if not reg:
            continue
        source = _resolve_source(entry, all_sources, modbus)
        if source is None:
            continue
        per_source[source.source_id].append(
            PlannedTag(
                tag_id=entry["tag"],
                asset_id=entry["asset_id"],
                unit=entry.get("unit", ""),
                address=int(reg["address"]) - source.address_base,
                width=int(reg.get("width", 1)),
                table=reg.get("table", "holding"),
                codec=reg.get("codec", "uint16"),
                scale=float(reg.get("scale", 1.0)),
                offset=float(reg.get("offset", 0.0)),
                stale_after_ms=int(entry.get("quality_policy", {}).get("stale_after_ms", 1500)),
            )
        )
    return modbus, per_source


def plan_blocks(
    source_id: str,
    unit_id: int,
    tags: Iterable[PlannedTag],
    *,
    limits: PlannerLimits = DEFAULT_LIMITS,
    forced_breaks: set[tuple[str, int, int, int]] | frozenset[tuple[str, int, int, int]] = frozenset(),
) -> list[ReadBlock]:
    ordered = sorted(tags, key=lambda t: (function_for_table(t.table), t.address, t.width, t.tag_id))
    blocks: list[ReadBlock] = []
    current: list[PlannedTag] = []
    cur_fn = cur_start = cur_end = -1

    def flush() -> None:
        if current:
            blocks.append(ReadBlock(source_id, unit_id, cur_fn, cur_start, cur_end - cur_start, tuple(current)))

    for tag in ordered:
        fn = function_for_table(tag.table)
        limit = limits.max_bits if fn in BIT_FUNCTIONS else limits.max_registers
        if tag.width > limit:
            raise ValueError(f"tag {tag.tag_id} width {tag.width} exceeds FC{fn:02d} limit {limit}")
        mergeable = (
            current
            and fn == cur_fn
            and tag.address - cur_end <= limits.max_gap
            and max(cur_end, tag.end) - cur_start <= limit
            and (source_id, unit_id, fn, tag.address) not in forced_breaks
        )
        if mergeable:
            current.append(tag)
            cur_end = max(cur_end, tag.end)
            continue
        flush()
        current = [tag]
        cur_fn, cur_start, cur_end = fn, tag.address, tag.end
    flush()
    return blocks


class BatchPlanner:
    """Per-device plan that learns from exception-02 answers."""

    def __init__(self, source_id: str, unit_id: int, tags: Iterable[PlannedTag], *, limits: PlannerLimits = DEFAULT_LIMITS) -> None:
        self.source_id = source_id
        self.unit_id = unit_id
        self.tags = tuple(tags)
        self.limits = limits
        self.forced_breaks: set[tuple[str, int, int, int]] = set()
        self.unreadable: set[tuple[str, int, int, int]] = set()
        self._blocks = self._replan()

    def _replan(self) -> list[ReadBlock]:
        return plan_blocks(self.source_id, self.unit_id, self.tags, limits=self.limits, forced_breaks=self.forced_breaks)

    @property
    def blocks(self) -> list[ReadBlock]:
        return list(self._blocks)

    def is_unreadable(self, block: ReadBlock) -> bool:
        return block.key in self.unreadable

    def split(self, block: ReadBlock) -> bool:
        """Split *block* after an illegal-address answer. Returns False if it cannot be split."""
        starts = sorted({t.address for t in block.tags})
        if len(starts) <= 1:
            self.unreadable.add(block.key)
            return False
        mid = starts[len(starts) // 2]
        self.forced_breaks.add((block.source_id, block.unit_id, block.function, mid))
        self._blocks = self._replan()
        return True
