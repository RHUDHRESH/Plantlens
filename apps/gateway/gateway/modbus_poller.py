"""Modbus read loop — decode, quality stamp, publish TagFrames."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Callable, Awaitable

import structlog
from pymodbus.client import AsyncModbusSerialClient, AsyncModbusTcpClient

from gateway.quality import DEFAULT_MISSING_AFTER_MS, quality_for_poll_age
from gateway.register_codec import CodecError, decode
from gateway.tag_frame import TagFrame

log = structlog.get_logger()

PublishFn = Callable[[TagFrame], Awaitable[None]]


@dataclass(frozen=True, slots=True)
class PollTag:
    tag_id: str
    asset_id: str
    unit: str
    address: int
    width: int
    table: str
    codec: str
    scale: float
    offset: float
    stale_after_ms: int


@dataclass(frozen=True, slots=True)
class PollGroup:
    source_id: str
    slave_id: int
    poll_ms: int
    table: str
    start_address: int
    count: int
    tags: tuple[PollTag, ...]


@dataclass
class PollDiagnostics:
    last_good_read_ts: datetime | None = None
    error_count: int = 0
    crc_failures: int = 0
    reconnect_count: int = 0
    stale_tag_count: int = 0


def _register_spec(tag_entry: dict[str, Any]) -> dict[str, Any] | None:
    return tag_entry.get("register")


def _resolve_modbus_source(
    entry: dict[str, Any],
    sources: dict[str, dict[str, Any]],
) -> tuple[str, dict[str, Any]] | None:
    source_id = entry.get("source_id")
    source = sources.get(source_id or "")
    if source and source.get("protocol") in {"modbus_rtu", "modbus_tcp"}:
        return source_id, source
    if _register_spec(entry) and source and source.get("protocol") == "simulator":
        for sid, candidate in sources.items():
            if candidate.get("protocol") in {"modbus_rtu", "modbus_tcp"}:
                return sid, candidate
    return None


def build_poll_plan(tag_map: dict[str, Any]) -> list[PollGroup]:
    sources = {s["source_id"]: s for s in tag_map.get("sources", [])}
    groups: dict[tuple[str, int, str, int, int], list[PollTag]] = {}

    for entry in tag_map.get("tags", []):
        resolved = _resolve_modbus_source(entry, sources)
        if not resolved:
            continue
        source_id, source = resolved
        reg = _register_spec(entry)
        if not reg:
            continue
        table = reg.get("table", "holding")
        address_base = int(source.get("serial", {}).get("address_base", 0))
        address = int(reg["address"]) - address_base
        width = int(reg.get("width", 1))
        codec = reg.get("codec", "uint16")
        scale = float(reg.get("scale", 1.0))
        offset = float(reg.get("offset", 0.0))
        stale_after = int(entry.get("quality_policy", {}).get("stale_after_ms", 1500))
        slave_id = int(source.get("serial", {}).get("slave_id", 1))
        poll_tag = PollTag(
            tag_id=entry["tag"],
            asset_id=entry["asset_id"],
            unit=entry.get("unit", ""),
            address=address,
            width=width,
            table=table,
            codec=codec,
            scale=scale,
            offset=offset,
            stale_after_ms=stale_after,
        )
        key = (source_id, slave_id, table, address, width)
        groups.setdefault(key, []).append(poll_tag)

    plan: list[PollGroup] = []
    for (source_id, slave_id, table, address, width), tags in sorted(groups.items()):
        source = sources[source_id]
        plan.append(
            PollGroup(
                source_id=source_id,
                slave_id=slave_id,
                poll_ms=int(source.get("poll_ms", 250)),
                table=table,
                start_address=address,
                count=width,
                tags=tuple(tags),
            )
        )
    return plan


def coalesce_poll_plan(
    plan: list[PollGroup],
    *,
    max_registers: int = 125,
) -> list[PollGroup]:
    """Combine adjacent reads without crossing a register gap.

    Modbus RTU pays most of its cost per request.  The Easy302 register bible lays
    out its float values consecutively, so one bounded FC03 read is materially
    cheaper than one request per tag.  We deliberately do not span gaps: an
    undocumented address inside a wide read can make a PLC reject the whole block.
    """
    if max_registers < 1:
        raise ValueError("max_registers must be positive")

    ordered = sorted(
        plan,
        key=lambda group: (
            group.source_id,
            group.slave_id,
            group.table,
            group.poll_ms,
            group.start_address,
        ),
    )
    merged: list[PollGroup] = []
    for group in ordered:
        if not merged:
            merged.append(group)
            continue
        previous = merged[-1]
        previous_end = previous.start_address + previous.count
        group_end = group.start_address + group.count
        compatible = (
            previous.source_id == group.source_id
            and previous.slave_id == group.slave_id
            and previous.table == group.table
            and previous.poll_ms == group.poll_ms
            and group.start_address <= previous_end
            and group_end - previous.start_address <= max_registers
        )
        if not compatible:
            merged.append(group)
            continue
        merged[-1] = PollGroup(
            source_id=previous.source_id,
            slave_id=previous.slave_id,
            poll_ms=previous.poll_ms,
            table=previous.table,
            start_address=previous.start_address,
            count=max(previous_end, group_end) - previous.start_address,
            tags=tuple(sorted((*previous.tags, *group.tags), key=lambda tag: tag.address)),
        )
    return merged


class ModbusPoller:
    def __init__(
        self,
        *,
        client: AsyncModbusSerialClient | AsyncModbusTcpClient,
        gateway_id: str,
        publish: PublishFn,
        diagnostics: PollDiagnostics | None = None,
    ) -> None:
        self._client = client
        self._gateway_id = gateway_id
        self._publish = publish
        self._seq = 0
        self._diag = diagnostics or PollDiagnostics()
        self._last_success: dict[str, datetime] = {}

    @property
    def diagnostics(self) -> PollDiagnostics:
        return self._diag

    def _next_seq(self) -> int:
        self._seq += 1
        return self._seq

    async def _read_registers(self, group: PollGroup) -> list[int] | None:
        if group.table == "input":
            rr = await self._client.read_input_registers(
                group.start_address, count=group.count, device_id=group.slave_id
            )
        else:
            rr = await self._client.read_holding_registers(
                group.start_address, count=group.count, device_id=group.slave_id
            )
        if rr.isError():
            self._diag.crc_failures += 1
            self._diag.error_count += 1
            return None
        return list(rr.registers)

    async def poll_group(self, group: PollGroup) -> None:
        now = datetime.now(UTC)
        try:
            if not self._client.connected:
                from gateway.serial_client import ensure_connected

                if not await ensure_connected(self._client):
                    await self._publish_stale(group, now)
                    return
            registers = await self._read_registers(group)
            if registers is None:
                await self._publish_bad(group, now)
                return
            self._diag.last_good_read_ts = now
            for tag in group.tags:
                offset = tag.address - group.start_address
                slice_regs = registers[offset : offset + tag.width]
                await self._publish_tag(tag, slice_regs, quality="GOOD", now=now)
                self._last_success[tag.tag_id] = now
        except Exception as exc:
            self._diag.error_count += 1
            log.warning("poll_group_error", source=group.source_id, error=str(exc))
            await self._publish_stale(group, now)

    async def _publish_tag(
        self,
        tag: PollTag,
        registers: list[int],
        *,
        quality: str,
        now: datetime,
        value: float | int | bool | None = None,
    ) -> None:
        if value is None and quality == "GOOD":
            try:
                value = decode(
                    registers,
                    tag.codec,
                    scale=tag.scale,
                    offset=tag.offset,
                )
            except CodecError:
                quality = "BAD"
                value = None
        frame = TagFrame(
            tag_id=tag.tag_id,
            asset_id=tag.asset_id,
            value=value,
            unit=tag.unit,
            quality=quality,  # type: ignore[arg-type]
            timestamp=now,
            source="modbus_rtu",
            seq=self._next_seq(),
            gateway_id=self._gateway_id,
        )
        await self._publish(frame)

    async def _publish_bad(self, group: PollGroup, now: datetime) -> None:
        for tag in group.tags:
            await self._publish_tag(tag, [], quality="BAD", now=now, value=None)

    async def _publish_stale(self, group: PollGroup, now: datetime) -> None:
        self._diag.stale_tag_count += len(group.tags)
        for tag in group.tags:
            last = self._last_success.get(tag.tag_id)
            quality = quality_for_poll_age(
                last_success=last,
                now=now,
                stale_after_ms=tag.stale_after_ms,
                missing_after_ms=max(tag.stale_after_ms * 3, DEFAULT_MISSING_AFTER_MS),
            )
            if quality == "GOOD":
                quality = "STALE"
            await self._publish_tag(tag, [], quality=quality, now=now, value=None)

    async def poll_loop(self, plan: list[PollGroup]) -> None:
        tasks = [asyncio.create_task(self._group_loop(group)) for group in plan]
        await asyncio.gather(*tasks)

    async def _group_loop(self, group: PollGroup) -> None:
        while True:
            await self.poll_group(group)
            await asyncio.sleep(group.poll_ms / 1000.0)
