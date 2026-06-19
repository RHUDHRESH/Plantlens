"""Wire scenario frames into the runtime tick and WebSocket broadcast."""

from __future__ import annotations

from datetime import timedelta, timezone
from typing import Any

from app.runtime.config_loader import RuntimeConfig, get_runtime_config
from app.runtime.runtime_state import RuntimeState, runtime_state
from app.runtime.runtime_tick import evaluate_runtime_tick, on_tag_frame
from app.runtime.simulator.scenario_runner import ScenarioRunner
from app.runtime.websocket_hub import WebSocketHub, websocket_hub
from app.schemas.tag_frame import TagFrame


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

    def _config_or_load(self) -> RuntimeConfig:
        return self._config or get_runtime_config()

    async def on_frame(self, frame: TagFrame) -> None:
        try:
            config = self._config_or_load()
            on_tag_frame(self._state, frame, config)
            now = frame.timestamp
            if now.tzinfo is None:
                now = now.replace(tzinfo=timezone.utc)

            await self._hub.broadcast(
                {
                    "type": "tag.frame",
                    "frame": frame.model_dump(mode="json"),
                }
            )
            await self._hub.broadcast(
                {
                    "type": "runtime.snapshot",
                    "ts": now.isoformat().replace("+00:00", "Z"),
                    "plant_id": config.plant_id,
                    "state": self._state.snapshot(),
                }
            )
        except Exception:
            return

    async def _finalize_tick(self, *, after_ms: int = 1000) -> None:
        """Re-evaluate once after the last frame so debounced alarms can latch."""
        if not self._state.tags:
            return
        latest = max(self._state.tags.values(), key=lambda frame: frame.timestamp)
        now = latest.timestamp + timedelta(milliseconds=after_ms)
        config = self._config_or_load()
        evaluate_runtime_tick(self._state, config, now=now)
        await self._hub.broadcast(
            {
                "type": "runtime.snapshot",
                "ts": now.isoformat().replace("+00:00", "Z"),
                "plant_id": config.plant_id,
                "state": self._state.snapshot(),
            }
        )

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