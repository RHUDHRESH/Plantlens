"""UNO Q passive gateway (deploy/uno-q): separate publish thread, no silent drops, STALE on silence."""

from __future__ import annotations

import importlib.util
import time
from pathlib import Path

import pytest

pytest.importorskip("fastapi")

MODULE_PATH = Path(__file__).resolve().parents[3] / "deploy/uno-q/plantlens_app/python/passive_gateway.py"
SPEC = importlib.util.spec_from_file_location("uno_q_passive_gateway_gw", MODULE_PATH)
assert SPEC and SPEC.loader
pg = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pg)

REQUEST = bytes.fromhex("06 03 00 00 00 01 85 BD")
RESPONSE = bytes.fromhex("06 03 02 00 F6 8D C2")


def test_gap_markers_split_segments_and_legacy_payload_still_parses():
    payload = "HEX,04,00,|,06,03,00,00,00,01,85,BD,|,06,03,02,00,F6,8D,C2,COUNT,17,OVF,2"
    segments = pg.parse_bridge_segments(payload)
    assert segments == [bytes.fromhex("04 00"), REQUEST, RESPONSE]
    assert pg.parse_bridge_overflow(payload) == 2
    assert pg.parse_bridge_payload("HEX,06,03,00,00,00,01,85,BD,COUNT,8") == REQUEST


def test_publisher_retries_in_order_and_quarantines_4xx():
    calls: list[tuple[int, list[int]]] = []
    statuses = [None, 503, 200, 422, 200]

    def post(url, frames):
        status = statuses.pop(0)
        calls.append((status, [f["seq"] for f in frames]))
        if status is None:
            raise OSError("connection refused")
        return status, ({"accepted": len(frames), "total": len(frames)} if status == 200 else "err")

    pub = pg.IngestPublisher("http://x", post=post)
    pub.enqueue([{"seq": i} for i in range(3)])
    assert pub.flush_once() is False
    assert pub.flush_once() is False
    assert pub.flush_once() is True
    pub.enqueue([{"seq": 9}])
    assert pub.flush_once() is True  # 422 -> quarantined, not retried forever
    assert [c[1] for c in calls] == [[0, 1, 2], [0, 1, 2], [0, 1, 2], [9]]
    assert pub.accepted == 3 and pub.quarantined == 1 and pub.failures == 3
    assert pub.last_error and "422" in pub.last_error


def test_capture_thread_publishes_via_queue_and_stale_on_silence(monkeypatch):
    monkeypatch.setattr(pg, "STALE_AFTER_MS", 200)
    monkeypatch.setattr(pg, "DRAIN_INTERVAL_S", 0.02)
    sent: list[dict] = []

    def post(url, frames):
        sent.extend(frames)
        return 200, {"accepted": len(frames), "total": len(frames)}

    gw = pg.PassiveGateway(publisher=pg.IngestPublisher("http://x", post=post))
    feeds = [[REQUEST, RESPONSE]]

    def capture_once():
        gw._drain_supported = True
        return feeds.pop(0) if feeds else []

    monkeypatch.setattr(gw, "_capture_once", capture_once)
    monkeypatch.setattr(gw._stop, "wait", lambda t=None: time.sleep(min(t or 0, 0.02)) or gw._stop.is_set())
    gw.start()
    try:
        deadline = time.monotonic() + 5
        while not any(f["quality"] == "STALE" for f in sent):
            assert time.monotonic() < deadline, sent
            time.sleep(0.02)
    finally:
        gw.stop()
    good = [f for f in sent if f["quality"] == "GOOD"]
    stale = [f for f in sent if f["quality"] == "STALE"]
    assert [(f["tag_id"], f["value"]) for f in good] == [("NATIVE_S6_HR_00000", 246.0)]
    assert stale[0]["tag_id"] == "NATIVE_S6_HR_00000" and stale[0]["value"] is None
    assert gw.status()["stale_publications"] >= 1
    assert gw.register_rows()[0]["quality"] == "STALE"
