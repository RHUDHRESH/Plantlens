"""Detection-latency regression tests.

Baseline (before deadline catch-up + ticker): DC_BUS_LOW (for_ms=500, condition true at
6000 ms) latched only at 7500 ms when an unrelated frame arrived; MOTOR_TEMP_HIGH never latched
during live playback. These tests pin the fixed behaviour.
"""

from __future__ import annotations

import asyncio
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.runtime.alarm_engine import reset_alarm_engine_state
from app.runtime.config_loader import get_runtime_config, reset_runtime_config_for_tests
from app.runtime.projection import reset_projection_history
from app.runtime.runtime_state import RuntimeState
from app.runtime.runtime_tick import frame_evaluation_time
from app.runtime.simulator.scenario_runner import ScenarioRunner
from app.runtime.simulator.simulator_gateway import SimulatorGateway
from app.runtime.ticker import RuntimeTicker
from app.runtime.websocket_hub import WebSocketHub
from app.schemas.tag_frame import TagFrame

REPO_ROOT = Path(__file__).resolve().parents[3]
DEMO_DIR = REPO_ROOT / "packages" / "sample-data" / "demo-microgrid"


@pytest.fixture(autouse=True)
def _reset() -> None:
    reset_runtime_config_for_tests()
    reset_alarm_engine_state()
    reset_projection_history()
    yield
    reset_runtime_config_for_tests()
    reset_alarm_engine_state()
    reset_projection_history()


def _runner() -> ScenarioRunner:
    return ScenarioRunner(
        scenarios_path=DEMO_DIR / "scenarios.json",
        tag_map_path=DEMO_DIR / "tag_map.json",
    )


def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def _replay(scenario_id: str) -> tuple[RuntimeState, list[TagFrame], dict[str, datetime]]:
    """Replay frames instantly; record the first instant each alarm became active."""
    runner = _runner()
    frames = asyncio.run(runner.collect_frames(scenario_id))
    state = RuntimeState()
    gateway = SimulatorGateway(state=state, hub=WebSocketHub(), runner=runner)
    first_seen: dict[str, datetime] = {}

    async def _run() -> None:
        for frame in frames:
            await gateway.on_frame(frame)
            for alarm_id, alarm in state.active_alarms.items():
                first_seen.setdefault(alarm_id, _parse(alarm["raised_at"]))
        await gateway._finalize_tick()
        for alarm_id, alarm in state.active_alarms.items():
            first_seen.setdefault(alarm_id, _parse(alarm["raised_at"]))

    asyncio.run(_run())
    return state, frames, first_seen


def test_debounced_alarm_latches_at_its_deadline_not_next_frame():
    _state, frames, first_seen = _replay("scn_motor_overload")
    t0 = frames[0].timestamp
    bus_low_ms = (first_seen["DC_BUS_LOW"] - t0).total_seconds() * 1000
    # Condition true at 6000 ms, for_ms=500 → exactly 6500 ms (was 7500 ms).
    assert bus_low_ms == pytest.approx(6500, abs=1)


def test_raised_at_is_stable_while_alarm_stays_active():
    state, _frames, first_seen = _replay("scn_motor_overload")
    for alarm_id, alarm in state.active_alarms.items():
        assert _parse(alarm["raised_at"]) == first_seen[alarm_id]
        assert _parse(alarm["onset_at"]) <= _parse(alarm["raised_at"])


def test_first_out_order_matches_physical_cause_order():
    _state, _frames, first_seen = _replay("scn_motor_overload")
    order = sorted(first_seen, key=lambda alarm_id: first_seen[alarm_id])
    assert order.index("MOTOR_CURRENT_HIGH") < order.index("DC_BUS_LOW")
    assert order.index("DC_BUS_LOW") < order.index("INV_UNDERVOLTAGE")


def test_full_pipeline_per_frame_is_fast():
    """Compute budget: whole pipeline well under a millisecond-scale budget per frame."""
    runner = _runner()
    frames = asyncio.run(runner.collect_frames("scn_motor_overload"))
    state = RuntimeState()
    gateway = SimulatorGateway(state=state, hub=WebSocketHub(), runner=runner)

    async def _run() -> float:
        start = time.perf_counter()
        for frame in frames:
            await gateway.on_frame(frame)
        return (time.perf_counter() - start) / len(frames)

    per_frame_s = asyncio.run(_run())
    assert per_frame_s < 0.02  # 20 ms is a generous CI ceiling; measured ~0.2 ms locally


def test_gateway_frames_use_server_clock_so_device_skew_cannot_hide_alarms():
    ingest = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)
    skewed_device_ts = ingest + timedelta(seconds=30)  # device clock 30 s fast
    frame = TagFrame(
        tag_id="MOTOR_301_CURRENT",
        asset_id="MTR-301",
        value=3.4,
        unit="A",
        quality="GOOD",
        source="modbus_rtu",
        timestamp=skewed_device_ts,
        ingest_ts=ingest,
    )
    assert frame_evaluation_time(frame) == ingest

    state = RuntimeState()
    gateway = SimulatorGateway(state=state, hub=WebSocketHub(), runner=_runner())
    assert asyncio.run(gateway.on_frame(frame)) is True
    assert state.tags["MOTOR_301_CURRENT"].quality == "GOOD"


def test_ticker_latches_debounce_without_any_further_frame():
    """Realtime path: after the last frame, only the ticker can complete a debounce."""
    config = get_runtime_config()
    rule = next(r for r in config.alarm_rules if r.id == "DC_BUS_LOW")
    debounce_ms = rule.delay_ms + rule.condition.for_ms
    assert debounce_ms > 0

    state = RuntimeState()
    hub = WebSocketHub()
    gateway = SimulatorGateway(state=state, hub=hub, runner=_runner(), config=config)

    async def _run() -> tuple[bool, bool, int]:
        frame = TagFrame(
            tag_id=rule.tag,
            asset_id="BUS-101",
            value=40.5,
            unit="V",
            quality="GOOD",
            source="modbus_rtu",
            timestamp=datetime.now(UTC),
            ingest_ts=datetime.now(UTC),
        )
        await gateway.on_frame(frame)
        before = "DC_BUS_LOW" in state.active_alarms
        ticker = RuntimeTicker(gateway, interval_ms=20)
        ticker.start()
        await asyncio.sleep(debounce_ms / 1000 + 0.25)
        await ticker.stop()
        return before, "DC_BUS_LOW" in state.active_alarms, ticker.pushes

    before, after, pushes = asyncio.run(_run())
    assert before is False
    assert after is True
    assert pushes >= 1


def test_evaluation_failure_is_reported_not_swallowed(monkeypatch: pytest.MonkeyPatch):
    import app.runtime.simulator.simulator_gateway as sg

    def _boom(*_args, **_kwargs):
        raise RuntimeError("synthetic failure")

    monkeypatch.setattr(sg, "on_tag_frame", _boom)
    gateway = SimulatorGateway(state=RuntimeState(), hub=WebSocketHub(), runner=_runner())
    frame = TagFrame(
        tag_id="MOTOR_301_CURRENT",
        asset_id="MTR-301",
        value=1.0,
        unit="A",
        quality="GOOD",
        source="simulator",
        timestamp=datetime.now(UTC),
    )
    assert asyncio.run(gateway.on_frame(frame)) is False
