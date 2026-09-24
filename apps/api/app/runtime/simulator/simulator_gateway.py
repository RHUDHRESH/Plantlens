"""Wire scenario frames into the runtime tick and WebSocket broadcast."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

import structlog

from app.runtime.config_loader import RuntimeConfig, get_runtime_config
from app.runtime.runtime_state import RuntimeState, runtime_state
from app.runtime.alarm_engine import next_debounce_deadline
from app.runtime.runtime_tick import (
    catch_up_debounce_deadlines,
    evaluate_runtime_tick,
    frame_evaluation_time,
    on_tag_frame,
)
from app.runtime.simulator.scenario_runner import ScenarioRunner
from app.runtime.websocket_hub import WebSocketHub, websocket_hub
from app.schemas.tag_frame import TagFrame

log = structlog.get_logger(__name__)


def _iso(ts: datetime) -> str:
    return ts.isoformat().replace("+00:00", "Z")


def runtime_signature(state: RuntimeState) -> tuple:
    """Cheap fingerprint of operator-visible state; the ticker only pushes when it changes."""
    return (
        tuple(
            sorted(
                (alarm_id, alarm.get("severity"), bool(alarm.get("acked")))
                for alarm_id, alarm in state.active_alarms.items()
            )
        ),
        tuple(sorted(state.active_situations)),
        tuple(sorted(state.asset_status.items())),
        tuple(sorted((tag_id, frame.quality) for tag_id, frame in state.tags.items())),
    )


class SimulatorGateway:
    """Connect scenario playback to runtime evaluation and WS fan-out."""

    def __init__(
        self,
        *,
        state: RuntimeState,
        hub: WebSocketHub,
        runner: ScenarioRunner,
        config: RuntimeConfig | None = None,
    ) -> None:
        self._state = state
        self._hub = hub
        self._runner = runner
        self._config = config
        self._last_signature: tuple | None = None

    def _config_or_load(self) -> RuntimeConfig:
        return self._config or get_runtime_config()

    async def _broadcast_snapshot(self, config: RuntimeConfig, now: datetime) -> None:
        await self._hub.broadcast(
            {
                "type": "runtime.snapshot",
                "ts": _iso(now),
                "plant_id": config.plant_id,
                "state": self._state.snapshot(),
            }
        )

    async def on_frame(self, frame: TagFrame) -> bool:
        """Evaluate one frame and push it; returns False (and logs) if evaluation failed."""
        try:
            config = self._config_or_load()
            on_tag_frame(self._state, frame, config)
        except Exception:
            log.exception("runtime_frame_evaluation_failed", tag_id=frame.tag_id, source=frame.source)
            return False
        try:
            await self._hub.broadcast({"type": "tag.frame", "frame": frame.model_dump(mode="json")})
            await self._broadcast_snapshot(config, frame_evaluation_time(frame))
        except Exception:
            log.exception("runtime_broadcast_failed", tag_id=frame.tag_id)
        self._last_signature = runtime_signature(self._state)
        return True

    async def tick(self, now: datetime | None = None) -> bool:
        """Periodic evaluation between frames (debounce deadlines, staleness).

        Returns True when operator-visible state changed and a snapshot was pushed.
        """
        now = now or self._state.clock_now()
        if now is None or not self._state.tags:
            return False
        config = self._config_or_load()
        has_polled_tags = any(f.source != "simulator" for f in self._state.tags.values())
        deadline = next_debounce_deadline()
        if not has_polled_tags and (deadline is None or deadline > now):
            return False
        try:
            catch_up_debounce_deadlines(self._state, config, until=now)
            evaluate_runtime_tick(self._state, config, now=now)
        except Exception:
            log.exception("runtime_tick_failed")
            return False
        signature = runtime_signature(self._state)
        if signature == self._last_signature:
            return False
        self._last_signature = signature
        await self._broadcast_snapshot(config, now)
        return True

    async def _finalize_tick(self, *, after_ms: int = 1000) -> None:
        """Re-evaluate once after the last frame so debounced alarms can latch."""
        if not self._state.tags:
            return
        latest = max(self._state.tags.values(), key=lambda frame: frame.timestamp)
        now = latest.timestamp + timedelta(milliseconds=after_ms)
        config = self._config_or_load()
        catch_up_debounce_deadlines(self._state, config, until=now)
        evaluate_runtime_tick(self._state, config, now=now)
        self._last_signature = runtime_signature(self._state)
        await self._broadcast_snapshot(config, now)

    async def start(self, scenario_id: str, *, realtime: bool = True) -> None:
        async def _reset() -> None:
            self._state.reset()
            from app.runtime.alarm_engine import reset_alarm_engine_state
            from app.runtime.projection import reset_projection_history

            reset_alarm_engine_state()
            reset_projection_history()

        async def _on_state(message: dict[str, Any]) -> None:
            await self._hub.broadcast(message)

        await self._runner.start(
            scenario_id,
            self.on_frame,
            realtime=realtime,
            on_reset=_reset,
            on_state=_on_state,
        )
        await self._finalize_tick()

    async def stop(self) -> None:
        await self._runner.stop()


_gateway: SimulatorGateway | None = None


def get_simulator_gateway() -> SimulatorGateway:
    global _gateway
    if _gateway is None:
        from pathlib import Path

        from app.settings import get_settings

        settings = get_settings()
        bundle_dir = Path(settings.sample_data_dir)
        if not bundle_dir.is_absolute():
            bundle_dir = Path(__file__).resolve().parents[3] / settings.sample_data_dir
        runner = ScenarioRunner(
            scenarios_path=bundle_dir / "scenarios.json",
            tag_map_path=bundle_dir / "tag_map.json",
        )
        _gateway = SimulatorGateway(
            state=runtime_state,
            hub=websocket_hub,
            runner=runner,
        )
    return _gateway


def reset_simulator_gateway_for_tests() -> None:
    global _gateway
    _gateway = None