"""SerialLink + LineReader against a pty-backed fake device (no hardware needed)."""

from __future__ import annotations

import asyncio
import time

import pytest

from gateway.diagnostics import probe_port
from gateway.line.protocols import LineDecoder, LineTagSpec, build_pl1
from gateway.line.reader import LineReader
from gateway.tag_frame import TagFrame
from gateway.transport.serial_link import LinkConfig, LinkStateKind, SerialLink, is_port_held

TAGS = {
    "VIB_X": LineTagSpec("VIB_X", "VIB-301", "mm/s", stale_after_ms=300),
    "VIB_Y": LineTagSpec("VIB_Y", "VIB-301", "mm/s", stale_after_ms=300),
}
COLS = {"A0": "VIB_X", "A1": "VIB_Y"}


async def wait_for(predicate, timeout: float = 5.0, interval: float = 0.01) -> float:
    start = time.monotonic()
    while not predicate():
        if time.monotonic() - start > timeout:
            raise AssertionError("condition not met in time")
        await asyncio.sleep(interval)
    return time.monotonic() - start


def make_reader(path: str, frames: list[TagFrame], **link_kw) -> LineReader:
    cfg = LinkConfig(selector=path, baudrate=115200, name="test", presence_check_s=0.1, **link_kw)

    async def publish(frame: TagFrame) -> None:
        frames.append(frame)

    return LineReader(
        link=SerialLink(cfg),
        decoder=LineDecoder(TAGS, column_map=COLS),
        gateway_id="gw-test",
        publish=publish,
        stale_check_s=0.05,
    )


async def run_reader(reader: LineReader):
    task = asyncio.create_task(reader.run_forever())
    await reader.link.wait_connected(5)
    return task


async def stop_reader(reader: LineReader, task: asyncio.Task) -> None:
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    await reader.link.stop()


async def test_split_lines_garbage_and_partial_first_line(pty_device):
    frames: list[TagFrame] = []
    reader = make_reader(str(pty_device.path), frames)
    task = await run_reader(reader)
    try:
        good = build_pl1(1, {"A0": "1.5", "A1": "2.5"}) + "\r\n"
        # joined mid-line (hold_dtr_low): the first partial line must be dropped
        pty_device.write(b"0=99.9,A1=99*00\n")
        pty_device.write(b"\xff\xfe\x00garbage\n")
        for piece in (good[:5], good[5:17], good[17:]):
            pty_device.write(piece)
            await asyncio.sleep(0.05)
        await wait_for(lambda: len(frames) >= 2)
        good_frames = [f for f in frames if f.quality == "GOOD"]
        assert [(f.tag_id, f.value) for f in good_frames] == [("VIB_X", 1.5), ("VIB_Y", 2.5)]
        assert all(f.source == "serial_line" for f in frames)
        assert reader.framer.stats.invalid_utf8 + reader.framer.stats.control_bytes == 1
        # a partial line on read timeout is never emitted
        pty_device.write(b"A0=7")
        await asyncio.sleep(0.7)
        assert all(f.value != 7.0 for f in frames)
    finally:
        await stop_reader(reader, task)


async def test_wait_for_reset_uses_ready_banner(pty_device):
    frames: list[TagFrame] = []
    reader = make_reader(
        str(pty_device.path),
        frames,
        reset_policy="wait_for_reset",
        reset_settle_ms=1500,
        ready_banner=r"^#PLANTLENS READY",
    )
    task = asyncio.create_task(reader.run_forever())
    try:
        await wait_for(lambda: reader.link.state.state is LinkStateKind.RESETTING)
        t0 = time.monotonic()
        pty_device.write(b"\x00\xf0bootloader-noise A0=66\n")  # boot noise before the banner
        pty_device.write(b"#PLANTLENS READY v1\n" + build_pl1(0, {"A0": 3}).encode() + b"\n")
        await reader.link.wait_connected(3)
        ready_after = time.monotonic() - t0
        assert ready_after < 1.0, "banner must end the settle window early"
        assert reader.link.aligned is True
        await wait_for(lambda: any(f.quality == "GOOD" for f in frames))
        assert [f.value for f in frames if f.quality == "GOOD"] == [3.0]
        assert reader.link.stats.banner_seen == 1
    finally:
        await stop_reader(reader, task)


async def test_unplug_and_replug_reconnects_with_backoff_and_stale(pty_device):
    frames: list[TagFrame] = []
    reader = make_reader(str(pty_device.path), frames)
    task = await run_reader(reader)
    try:
        pty_device.write("\n" + build_pl1(1, {"A0": 1}) + "\n")
        await wait_for(lambda: any(f.quality == "GOOD" for f in frames))

        pty_device.unplug()
        await wait_for(lambda: not reader.link.connected, timeout=2)
        # STALE is published while the device is gone
        await wait_for(lambda: any(f.quality == "STALE" and f.tag_id == "VIB_X" for f in frames), timeout=2)
        failures_before = reader.link.stats.open_failures
        await asyncio.sleep(1.0)
        # capped exponential backoff: 0.25+0.5 s -> at most ~3 attempts in a second, never a tight loop
        assert reader.link.stats.open_failures - failures_before <= 4

        pty_device.plug()
        t_replug = time.monotonic()
        count = len([f for f in frames if f.quality == "GOOD"])

        async def feed() -> None:
            seq = 10
            while True:
                if pty_device.master is not None:
                    pty_device.write("\n" + build_pl1(seq, {"A0": 2}) + "\n")
                seq += 1
                await asyncio.sleep(0.05)

        feeder = asyncio.create_task(feed())
        try:
            await wait_for(lambda: len([f for f in frames if f.quality == "GOOD"]) > count, timeout=8)
        finally:
            feeder.cancel()
        reconnect_s = time.monotonic() - t_replug
        print(f"\nMEASURE reconnect_after_pty_replug_s={reconnect_s:.2f}")
        assert reconnect_s < 6.0
        assert reader.link.state.reconnect_count == 1
    finally:
        await stop_reader(reader, task)


@pytest.mark.skipif(not hasattr(__import__("fcntl"), "flock"), reason="flock not available")
async def test_exclusive_open_and_probe_refuses_held_port(pty_device):
    first = SerialLink(LinkConfig(selector=str(pty_device.path), name="first"))
    second = SerialLink(LinkConfig(selector=str(pty_device.path), name="second", backoff_min_s=0.1))
    await first.start()
    try:
        assert await first.wait_connected(3)
        assert is_port_held(str(pty_device.path)) == "first"
        probe = probe_port(str(pty_device.path), baudrate=9600)
        assert probe.available is False and "held_by_gateway_link" in probe.detail
        await second.start()
        await wait_for(lambda: second.stats.open_failures >= 1, timeout=3)
        assert not second.connected
        assert "lock" in (second.state.last_error or "").lower()
    finally:
        await second.stop()
        await first.stop()
    assert is_port_held(str(pty_device.path)) is None
