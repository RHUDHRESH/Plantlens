"""Uplink ordering, 4xx quarantine, 5xx retry and accepted-vs-total checks (httpx MockTransport)."""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime

import httpx

from gateway.publish import FramePublisher
from gateway.publish.uplink import Uplink
from gateway.tag_frame import TagFrame

NOW = datetime(2026, 9, 24, 12, 0, tzinfo=UTC)


def frame(seq: int, tag: str = "BUS_101_V") -> TagFrame:
    return TagFrame(
        tag_id=tag, asset_id="BUS-101", value=float(seq), unit="V", quality="GOOD",
        timestamp=NOW, source="modbus_rtu", seq=seq, gateway_id="gw",
    )


class Api:
    def __init__(self, statuses: list[int], accepted_delta: int = 0) -> None:
        self.statuses = statuses
        self.accepted_delta = accepted_delta
        self.batches: list[list[int]] = []
        self.paths: list[str] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        self.paths.append(request.url.path)
        status = self.statuses.pop(0) if self.statuses else 200
        if status == 200:
            self.batches.append([f["seq"] for f in body])
            return httpx.Response(200, json={"status": "ok", "accepted": len(body) - self.accepted_delta, "total": len(body)})
        return httpx.Response(status, text="nope")


def make(api: Api, **kw) -> Uplink:
    return Uplink(api_base="http://api", token="t", transport=httpx.MockTransport(api.handler), **kw)


async def test_batches_preserve_order_and_respect_batch_max():
    api = Api([])
    up = make(api, batch_max=200, flush_interval_s=0.05)
    await up.start()
    for i in range(450):
        await up.publish(frame(i))
    try:
        for _ in range(100):
            if up.sent_frames == 450:
                break
            await asyncio.sleep(0.02)
    finally:
        await up.close()
    sent = [seq for batch in api.batches for seq in batch]
    assert sent == list(range(450))
    assert max(len(b) for b in api.batches) == 200
    assert set(api.paths) == {"/api/ingest/frame/batch"}
    assert up.snapshot()["queue_depth"] == 0


async def test_4xx_is_quarantined_not_retried():
    api = Api([422])
    up = make(api, batch_max=10)
    for i in range(15):
        up.enqueue(frame(i))
    assert await up.flush_once() is True  # 422: quarantined, queue moves on
    assert await up.flush_once() is True
    await up.close()
    assert up.quarantined == 10 and up.quarantined_batches == 1
    assert api.batches == [list(range(10, 15))]
    assert up.retries == 0


async def test_5xx_and_network_errors_requeue_in_original_order_with_backoff():
    calls = {"n": 0}
    api = Api([503, 200])

    def flaky(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            raise httpx.ConnectError("refused", request=request)
        return api.handler(request)

    up = Uplink(api_base="http://api", token="t", transport=httpx.MockTransport(flaky), batch_max=5, backoff_min_s=0.01)
    for i in range(8):
        up.enqueue(frame(i))
    assert await up.flush_once() is False  # network error
    assert [f.seq for f in up._queue] == list(range(8))
    assert await up.flush_once() is False  # 503
    assert [f.seq for f in up._queue] == list(range(8))
    assert await up.flush_once() is True
    assert await up.flush_once() is True
    await up.close()
    assert api.batches == [[0, 1, 2, 3, 4], [5, 6, 7]]
    assert up.retries == 2 and up.quarantined == 0


async def test_partial_acceptance_is_counted():
    api = Api([], accepted_delta=1)
    up = make(api, batch_max=4)
    for i in range(4):
        up.enqueue(frame(i))
    await up.flush_once()
    await up.close()
    assert up.accepted_frames == 3 and up.not_accepted_frames == 1


async def test_overflow_drops_oldest_and_counts():
    up = make(Api([]), queue_max=10)
    for i in range(15):
        up.enqueue(frame(i))
    assert up.dropped == 5
    assert [f.seq for f in up._queue] == list(range(5, 15))
    await up.close()


def test_frame_publisher_name_is_kept():
    assert FramePublisher is Uplink
