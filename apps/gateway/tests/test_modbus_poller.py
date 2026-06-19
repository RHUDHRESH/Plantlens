"""Modbus poller integration tests with in-process TCP simulator."""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path

import pytest
from pymodbus.client import AsyncModbusTcpClient

from gateway.modbus_poller import ModbusPoller, PollGroup, PollTag, build_poll_plan
from gateway.simulator_adapter import float32_be_to_registers, start_modbus_tcp_simulator

REPO_ROOT = Path(__file__).resolve().parents[3]
TAG_MAP = REPO_ROOT / "packages" / "sample-data" / "demo-microgrid" / "tag_map.json"


@pytest.fixture
async def modbus_server():
    hi, lo = float32_be_to_registers(48.0)
    task = await start_modbus_tcp_simulator(
        port=15020,
        holding_registers={20: hi, 21: lo, 30: hi, 31: lo},
    )
    await asyncio.sleep(0.2)
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


@pytest.mark.asyncio
async def test_poll_plan_includes_register_backed_tags():
    tag_map = json.loads(TAG_MAP.read_text(encoding="utf-8"))
    plan = build_poll_plan(tag_map)
    tag_ids = {tag.tag_id for group in plan for tag in group.tags}
    assert "BUS_101_V" in tag_ids
    assert "MOTOR_301_CURRENT" in tag_ids


@pytest.mark.asyncio
async def test_poller_reads_good_quality():
    published: list = []

    async def capture(frame):
        published.append(frame)

    hi, lo = float32_be_to_registers(48.0)

    class _FakeClient:
        connected = True

        async def read_holding_registers(self, *_args, **_kwargs):
            class _RR:
                def isError(self):
                    return False

                registers = [hi, lo]

            return _RR()

    group = PollGroup(
        source_id="gw-rs485-1",
        slave_id=1,
        poll_ms=100,
        table="holding",
        start_address=20,
        count=2,
        tags=(
            PollTag(
                tag_id="BUS_101_V",
                asset_id="BUS-101",
                unit="V",
                address=20,
                width=2,
                table="holding",
                codec="float32_be",
                scale=1.0,
                offset=0.0,
                stale_after_ms=1500,
            ),
        ),
    )
    poller = ModbusPoller(client=_FakeClient(), gateway_id="test-gw", publish=capture)
    await poller.poll_group(group)
    assert published
    assert published[0].quality == "GOOD"
    assert published[0].tag_id == "BUS_101_V"
    assert abs(float(published[0].value) - 48.0) < 0.01


@pytest.mark.asyncio
async def test_disconnect_publishes_stale():
    published: list = []

    async def capture(frame):
        published.append(frame)

    client = AsyncModbusTcpClient(host="127.0.0.1", port=19999)
    group = PollGroup(
        source_id="gw-rs485-1",
        slave_id=1,
        poll_ms=100,
        table="holding",
        start_address=20,
        count=2,
        tags=(
            PollTag(
                tag_id="BUS_101_V",
                asset_id="BUS-101",
                unit="V",
                address=20,
                width=2,
                table="holding",
                codec="float32_be",
                scale=1.0,
                offset=0.0,
                stale_after_ms=1500,
            ),
        ),
    )
    poller = ModbusPoller(client=client, gateway_id="test-gw", publish=capture)
    await poller.poll_group(group)
    assert published
    assert published[0].quality == "STALE"


@pytest.mark.asyncio
async def test_bad_decode_fails_closed():
    published: list = []

    async def capture(frame):
        published.append(frame)

    class _FakeClient:
        connected = True

        async def read_holding_registers(self, *_args, **_kwargs):
            class _RR:
                def isError(self):
                    return False

                registers = [0]

            return _RR()

    poller = ModbusPoller(client=_FakeClient(), gateway_id="test-gw", publish=capture)
    group = PollGroup(
        source_id="gw",
        slave_id=1,
        poll_ms=100,
        table="holding",
        start_address=20,
        count=2,
        tags=(
            PollTag(
                tag_id="BUS_101_V",
                asset_id="BUS-101",
                unit="V",
                address=20,
                width=2,
                table="holding",
                codec="float32_be",
                scale=1.0,
                offset=0.0,
                stale_after_ms=1500,
            ),
        ),
    )
    await poller.poll_group(group)
    assert published[0].quality == "BAD"