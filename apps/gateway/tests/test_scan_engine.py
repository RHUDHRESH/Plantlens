"""ScanEngine against the pymodbus simulator (TCP in-process, RTU over a pty 'bus')."""

from __future__ import annotations

import asyncio
import copy
import json
import struct
import time
from pathlib import Path
from typing import Any

import pytest
from pymodbus.server import ModbusSerialServer, ModbusTcpServer
from pymodbus.simulator import DataType, SimData, SimDevice

from gateway.main import GatewayRuntime, build_scan_engine
from gateway.modbus.batch_planner import BatchPlanner, PlannedTag, tags_from_tag_map
from gateway.modbus.guard import ReadOnlyGuard, ReadOnlyViolation, ReadRequest
from gateway.modbus.scan_engine import ScanEngine, ScanTiming
from gateway.modbus.transports import RtuTransport, TcpTransport, encode_pdu, encode_rtu
from gateway.settings import Settings
from gateway.tag_frame import TagFrame
from gateway.transport.serial_link import LinkConfig, SerialLink

REPO_ROOT = Path(__file__).resolve().parents[3]
DEMO = json.loads((REPO_ROOT / "packages/sample-data/demo-microgrid/tag_map.json").read_text(encoding="utf-8"))


def cdab(value: float) -> list[int]:
    hi, lo = struct.unpack(">HH", struct.pack(">f", value))
    return [lo, hi]


def demo_registers() -> list[int]:
    regs = [0] * 42
    regs[0:2] = cdab(48.25)  # PV_101_V
    regs[24] = 400  # VFD_V int16
    regs[26] = 1234  # VFD_I / MOTOR_301_CURRENT int16 scale 0.01
    return regs


class Counter:
    def __init__(self) -> None:
        self.requests = 0
        self.functions: list[int] = []

    def trace_pdu(self, sending: bool, pdu: Any) -> Any:
        if not sending:
            self.requests += 1
            self.functions.append(pdu.function_code)
        return pdu


async def start_tcp_server(port: int, simdata: list[SimData], counter: Counter, dev_id: int = 1) -> ModbusTcpServer:
    server = ModbusTcpServer(
        [SimDevice(id=dev_id, simdata=simdata)],
        address=("127.0.0.1", port),
        ignore_missing_devices=True,
        trace_pdu=counter.trace_pdu,
    )
    await server.serve_forever(background=True)
    return server


def tcp_tag_map(port: int) -> dict[str, Any]:
    tag_map = copy.deepcopy(DEMO)
    for src in tag_map["sources"]:
        if src["protocol"] == "modbus_rtu":
            src.update({"protocol": "modbus_tcp", "host": "127.0.0.1", "port": port, "unit_id": 1})
    return tag_map


async def test_demo_map_is_one_request_per_scan_over_tcp():
    counter = Counter()
    server = await start_tcp_server(15502, [SimData(address=0, values=demo_registers(), datatype=DataType.REGISTERS)], counter)
    frames: list[TagFrame] = []

    async def publish(frame: TagFrame) -> None:
        frames.append(frame)

    runtime = GatewayRuntime()
    engine = build_scan_engine(Settings(), tcp_tag_map(15502), publish, runtime)
    try:
        assert engine.requests_per_scan() == 1
        (device,) = engine.devices
        for _ in range(3):
            await engine.scan_once(device)
        assert counter.requests == 3
        assert set(counter.functions) == {3}
        by_tag = {f.tag_id: f for f in frames}
        assert len(frames) == 3 * 23
        assert abs(float(by_tag["PV_101_V"].value) - 48.25) < 1e-3
        assert by_tag["VFD_V"].value == 400.0
        assert abs(float(by_tag["MOTOR_301_CURRENT"].value) - 12.34) < 1e-9
        assert {f.source for f in frames} == {"modbus_tcp"}
        assert {f.quality for f in frames} == {"GOOD"}
        assert runtime.snapshot()["modbus"]["requests_per_scan"] == 1
    finally:
        for t in runtime.tcp:
            await t.close()
        await server.shutdown()


async def test_illegal_address_splits_block_and_remembers():
    counter = Counter()
    simdata = [
        SimData(address=0, values=[11, 12], datatype=DataType.REGISTERS),
        SimData(address=6, values=[13], datatype=DataType.REGISTERS),
    ]
    server = await start_tcp_server(15503, simdata, counter)
    frames: list[TagFrame] = []

    async def publish(frame: TagFrame) -> None:
        frames.append(frame)

    transport = TcpTransport("127.0.0.1", 15503)
    engine = ScanEngine(gateway_id="gw", publish=publish)
    tags = [PlannedTag("A", "A-1", "", 0, 1, "holding", "uint16"), PlannedTag("B", "A-1", "", 6, 1, "holding", "uint16")]
    device = engine.add_device(source_id="s", unit_id=1, source="modbus_tcp", poll_ms=100, tags=tags, guard=ReadOnlyGuard(transport))
    try:
        assert [(b.start, b.count) for b in device.planner.blocks] == [(0, 7)]  # gap 2..5 merged
        await engine.scan_once(device)
        assert device.diag.exception_responses == 1 and device.diag.illegal_address_splits == 1
        assert [(b.start, b.count) for b in device.planner.blocks] == [(0, 1), (6, 1)]
        await engine.scan_once(device)
        await engine.scan_once(device)
        assert counter.requests == 1 + 2 + 2
        assert [(f.tag_id, f.value) for f in frames if f.quality == "GOOD"][-2:] == [("A", 11.0), ("B", 13.0)]
    finally:
        await transport.close()
        await server.shutdown()


async def silent_server(port: int) -> asyncio.base_events.Server:
    async def swallow(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            while await reader.read(256):
                pass
        finally:
            writer.close()

    return await asyncio.start_server(swallow, "127.0.0.1", port)


async def test_silent_device_goes_stale_in_bounded_time_and_others_keep_scanning():
    counter = Counter()
    server = await start_tcp_server(15504, [SimData(address=0, values=[7] * 4, datatype=DataType.REGISTERS)], counter)
    mute = await silent_server(15505)
    frames: list[tuple[float, TagFrame]] = []

    async def publish(frame: TagFrame) -> None:
        frames.append((time.monotonic(), frame))

    timing = ScanTiming(timeout_s=0.25, retries=1)
    engine = ScanEngine(gateway_id="gw", publish=publish, timing=timing)
    live = TcpTransport("127.0.0.1", 15504)
    dead = TcpTransport("127.0.0.1", 15505)
    stale_after_ms = 1500
    engine.add_device(
        source_id="live", unit_id=1, source="modbus_tcp", poll_ms=250,
        tags=[PlannedTag("LIVE_T", "A-1", "", 0, 1, "holding", "uint16", stale_after_ms=stale_after_ms)],
        guard=ReadOnlyGuard(live),
    )
    silent_dev = engine.add_device(
        source_id="dead", unit_id=1, source="modbus_tcp", poll_ms=250,
        tags=[PlannedTag("DEAD_T", "A-2", "", 0, 1, "holding", "uint16", stale_after_ms=stale_after_ms)],
        guard=ReadOnlyGuard(dead),
    )
    t0 = time.monotonic()
    await engine.start()
    try:
        while not any(f.tag_id == "DEAD_T" and f.quality == "STALE" for _, f in frames):
            assert time.monotonic() - t0 < 5, "silent device never went STALE"
            await asyncio.sleep(0.02)
        stale_at = next(t for t, f in frames if f.tag_id == "DEAD_T" and f.quality == "STALE") - t0
        await asyncio.sleep(1.0)
    finally:
        await engine.stop()
        await live.close()
        await dead.close()
        mute.close()
        await server.shutdown()
    bound = stale_after_ms / 1000 + 0.25 + timing.timeout_s * (timing.retries + 1)
    print(f"\nMEASURE time_to_stale_silent_slave_s={stale_at:.2f} (bound {bound:.2f})")
    assert stale_at <= bound + 0.3
    assert silent_dev.diag.timeouts >= 2
    live_good = [t for t, f in frames if f.tag_id == "LIVE_T" and f.quality == "GOOD"]
    elapsed = live_good[-1] - live_good[0]
    assert len(live_good) >= elapsed / 0.25 * 0.8, "live device must keep its scan rate"
    assert not any(f.tag_id == "LIVE_T" and f.quality != "GOOD" for _, f in frames)


async def test_rtu_over_pty_bus_with_silent_slave_on_same_bus(pty_bus_factory):
    """Real RTU framing (CRC, t3.5) against pymodbus' serial server; unit 7 never answers."""
    bus = pty_bus_factory(drop_request=lambda data: data[:1] == b"\x07")
    counter = Counter()
    server = ModbusSerialServer(
        [SimDevice(id=1, simdata=[SimData(address=0, values=demo_registers(), datatype=DataType.REGISTERS)])],
        port=str(bus.a.path),
        baudrate=38400,
        trace_pdu=counter.trace_pdu,
    )
    await server.serve_forever(background=True)
    link = SerialLink(LinkConfig(selector=str(bus.b.path), baudrate=38400, name="rtu-test"))
    await link.start()
    assert await link.wait_connected(3)
    rtu = RtuTransport(link, baudrate=38400)
    frames: list[TagFrame] = []

    async def publish(frame: TagFrame) -> None:
        frames.append(frame)

    engine = ScanEngine(gateway_id="gw", publish=publish, timing=ScanTiming(timeout_s=0.2, retries=1))
    _, per_source = tags_from_tag_map(DEMO)
    demo_tags = next(iter(per_source.values()))
    good = engine.add_device(source_id="gw-rs485-1", unit_id=1, source="modbus_rtu", poll_ms=100, tags=demo_tags, guard=ReadOnlyGuard(rtu))
    mute = engine.add_device(
        source_id="gw-rs485-1-u7", unit_id=7, source="modbus_rtu", poll_ms=100,
        tags=[PlannedTag("U7_T", "A-7", "", 0, 1, "holding", "uint16", stale_after_ms=400)],
        guard=ReadOnlyGuard(rtu),
    )
    try:
        await asyncio.sleep(0.3)  # let the server open its end
        for _ in range(3):
            await engine.scan_once(good)
            await engine.scan_once(mute)
        assert good.diag.good_reads == 3, good.diag.as_dict()
        assert counter.requests == 3  # 1 request per scan for the whole demo map
        assert mute.diag.timeouts == 2
        assert mute.diag.backoff_until > time.monotonic() - 0.5
        assert bus.dropped == 2  # the silent unit was tried once (+1 retry), then backed off
        by_tag = {f.tag_id: f for f in frames}
        assert abs(float(by_tag["PV_101_V"].value) - 48.25) < 1e-3
        assert {f.source for f in frames} == {"modbus_rtu"}
        assert good.diag.crc_errors == 0
    finally:
        await link.stop()
        await server.shutdown()


class SpyTransport:
    def __init__(self, words: list[int] | None = None) -> None:
        self.calls: list[ReadRequest] = []
        self.words = words

    async def read(self, request: ReadRequest, *, timeout: float) -> list[int]:
        self.calls.append(request)
        if self.words is None:
            return [0] * request.count
        return list(self.words)

    async def close(self) -> None:
        return None


@pytest.mark.parametrize("fc", [5, 6, 15, 16, 22, 23, 8, 43])
async def test_write_function_codes_never_reach_transport(fc: int):
    spy = SpyTransport()
    guard = ReadOnlyGuard(spy)
    with pytest.raises(ReadOnlyViolation):
        ReadRequest(unit=1, function=fc, address=0, count=1)
    forged = object.__new__(ReadRequest)
    for name, value in (("unit", 1), ("function", fc), ("address", 0), ("count", 1)):
        object.__setattr__(forged, name, value)
    with pytest.raises(ReadOnlyViolation):
        await guard.read(forged, timeout=0.1)
    with pytest.raises(ReadOnlyViolation):
        encode_rtu(forged)
    with pytest.raises(ReadOnlyViolation):
        encode_pdu(forged)
    with pytest.raises(ReadOnlyViolation):
        guard.write_register  # noqa: B018
    assert spy.calls == []
    assert guard.blocked == 1


def test_planner_tables_only_produce_read_codes():
    tags = [PlannedTag(f"T{i}", "A-1", "", i, 1, table, "uint16") for i, table in enumerate(["coil", "discrete", "holding", "input"])]
    planner = BatchPlanner("s", 1, tags)
    assert sorted(b.request().function for b in planner.blocks) == [1, 2, 3, 4]


# ---------------------------------------------------------------- ported from test_modbus_poller
BUS_TAG = PlannedTag("BUS_101_V", "BUS-101", "V", 20, 2, "holding", "float32_be", stale_after_ms=200)


async def test_good_read_publishes_good_frame():
    frames: list[TagFrame] = []

    async def publish(frame: TagFrame) -> None:
        frames.append(frame)

    hi, lo = struct.unpack(">HH", struct.pack(">f", 48.0))
    engine = ScanEngine(gateway_id="gw", publish=publish)
    device = engine.add_device(source_id="s", unit_id=1, source="modbus_rtu", poll_ms=100, tags=[BUS_TAG], guard=ReadOnlyGuard(SpyTransport([hi, lo])))
    await engine.scan_once(device)
    assert [(f.tag_id, f.quality, f.source) for f in frames] == [("BUS_101_V", "GOOD", "modbus_rtu")]
    assert abs(float(frames[0].value) - 48.0) < 0.01


async def test_short_read_fails_closed_as_bad():
    frames: list[TagFrame] = []

    async def publish(frame: TagFrame) -> None:
        frames.append(frame)

    engine = ScanEngine(gateway_id="gw", publish=publish)
    device = engine.add_device(source_id="s", unit_id=1, source="modbus_rtu", poll_ms=100, tags=[BUS_TAG], guard=ReadOnlyGuard(SpyTransport([0])))
    await engine.scan_once(device)
    assert frames[0].quality == "BAD" and frames[0].value is None


async def test_unreachable_tcp_device_goes_stale_after_stale_after_ms():
    frames: list[TagFrame] = []

    async def publish(frame: TagFrame) -> None:
        frames.append(frame)

    transport = TcpTransport("127.0.0.1", 19999, connect_timeout=0.2)
    engine = ScanEngine(gateway_id="gw", publish=publish)
    device = engine.add_device(source_id="s", unit_id=1, source="modbus_tcp", poll_ms=100, tags=[BUS_TAG], guard=ReadOnlyGuard(transport))
    await engine.scan_once(device)
    assert device.diag.link_errors == 1 and frames == []
    await asyncio.sleep(0.25)
    await engine.scan_once(device)
    assert [(f.quality, f.value, f.source) for f in frames] == [("STALE", None, "modbus_tcp")]
    await engine.scan_once(device)
    assert len(frames) == 1, "STALE is re-asserted once per stale period, not every scan"
