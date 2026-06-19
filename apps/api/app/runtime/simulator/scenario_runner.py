"""Deterministic scenario playback as TagFrame streams."""

from __future__ import annotations

import asyncio
import json
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from app.schemas.tag_frame import TagFrame

SCENARIO_EPOCH = datetime(2026, 6, 18, 12, 0, 0, tzinfo=timezone.utc)
RAMP_POLL_MS = 500


class ScenarioError(Exception):
    """Base scenario error."""


class ScenarioNotFoundError(ScenarioError):
    """Unknown scenario id."""


class InvalidScenarioDataError(ScenarioError):
    """Scenario bundle failed validation."""


EmitCallback = Callable[[TagFrame], Awaitable[None]]


def load_scenarios(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if "scenarios" not in data:
        msg = "scenarios.json missing 'scenarios' array"
        raise InvalidScenarioDataError(msg)
    return data


def get_scenario(scenarios_doc: dict[str, Any], scenario_id: str) -> dict[str, Any]:
    for scenario in scenarios_doc.get("scenarios", []):
        if scenario.get("id") == scenario_id:
            return scenario
    raise ScenarioNotFoundError(f"Unknown scenario: {scenario_id}")


def _scenario_timestamp(at_ms: int) -> datetime:
    return SCENARIO_EPOCH + timedelta(milliseconds=at_ms)


class ScenarioRunner:
    """Play timed scenario events; one scenario lock at a time."""

    def __init__(
        self,
        *,
        scenarios_path: Path,
        tag_map_path: Path,
    ) -> None:
        self._scenarios_path = scenarios_path
        self._tag_map_path = tag_map_path
        self._scenarios_doc = load_scenarios(scenarios_path)
        self._tag_lookup = self._build_tag_lookup(tag_map_path)
        self._task: asyncio.Task[None] | None = None
        self._seq = 0
        self._running_scenario_id: str | None = None

    @staticmethod
    def _build_tag_lookup(tag_map_path: Path) -> dict[str, dict[str, Any]]:
        data = json.loads(tag_map_path.read_text(encoding="utf-8"))
        return {entry["tag"]: entry for entry in data.get("tags", [])}

    def reload(self) -> None:
        self._scenarios_doc = load_scenarios(self._scenarios_path)

    @property
    def running_scenario_id(self) -> str | None:
        return self._running_scenario_id

    def _next_seq(self) -> int:
        self._seq += 1
        return self._seq

    def _resolve_meta(self, event: dict[str, Any]) -> tuple[str, str]:
        tag_id = str(event["tag"])
        meta = self._tag_lookup.get(tag_id)
        asset_id = event.get("asset_id") or (meta or {}).get("asset_id")
        unit = event.get("unit") or (meta or {}).get("unit") or ""
        if not asset_id:
            msg = f"Scenario event references unknown tag '{tag_id}'"
            raise InvalidScenarioDataError(msg)
        return str(asset_id), str(unit)

    def _build_frame(
        self,
        *,
        scenario_id: str,
        tag_id: str,
        asset_id: str,
        value: Any,
        unit: str,
        quality: str,
        at_ms: int,
    ) -> TagFrame:
        return TagFrame(
            tag_id=tag_id,
            asset_id=asset_id,
            value=value,
            unit=unit,
            quality=quality,  # type: ignore[arg-type]
            timestamp=_scenario_timestamp(at_ms),
            source="simulator",
            seq=self._next_seq(),
            scenario_id=scenario_id,
        )

    def _frames_for_event(self, scenario_id: str, event: dict[str, Any]) -> list[TagFrame]:
        tag_id = str(event["tag"])
        asset_id, unit = self._resolve_meta(event)
        action = event["action"]
        at_ms = int(event["at_ms"])
        quality = event.get("quality", "GOOD")

        if action == "set":
            return [
                self._build_frame(
                    scenario_id=scenario_id,
                    tag_id=tag_id,
                    asset_id=asset_id,
                    value=event.get("value"),
                    unit=unit,
                    quality=quality,
                    at_ms=at_ms,
                )
            ]

        if action == "ramp":
            start = float(event["from"])
            end = float(event["to"])
            over_ms = int(event["over_ms"])
            steps = max(1, over_ms // RAMP_POLL_MS)
            frames: list[TagFrame] = []
            for step in range(steps + 1):
                ratio = step / steps
                value = start + (end - start) * ratio
                frame_ms = at_ms + int(over_ms * ratio)
                frames.append(
                    self._build_frame(
                        scenario_id=scenario_id,
                        tag_id=tag_id,
                        asset_id=asset_id,
                        value=round(value, 4),
                        unit=unit,
                        quality="GOOD",
                        at_ms=frame_ms,
                    )
                )
            return frames

        if action == "fault":
            fault_quality = quality if quality != "GOOD" else "STALE"
            return [
                self._build_frame(
                    scenario_id=scenario_id,
                    tag_id=tag_id,
                    asset_id=asset_id,
                    value=event.get("value"),
                    unit=unit,
                    quality=fault_quality,
                    at_ms=at_ms,
                )
            ]

        msg = f"Unsupported scenario action: {action}"
        raise InvalidScenarioDataError(msg)

    async def run_scenario(
        self,
        scenario_id: str,
        emit: EmitCallback,
        *,
        realtime: bool = True,
        on_state: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
    ) -> None:
        scenario = get_scenario(self._scenarios_doc, scenario_id)
        self._seq = 0
        self._running_scenario_id = scenario_id
        events = sorted(scenario["events"], key=lambda item: int(item["at_ms"]))
        total = len(events)

        if on_state:
            await on_state(
                {"type": "scenario.state", "scenario_id": scenario_id, "status": "started"}
            )

        prev_ms = 0
        for index, event in enumerate(events):
            at_ms = int(event["at_ms"])
            if realtime and at_ms > prev_ms:
                await asyncio.sleep((at_ms - prev_ms) / 1000)
            prev_ms = at_ms

            for frame in self._frames_for_event(scenario_id, event):
                await emit(frame)

            if on_state:
                await on_state(
                    {
                        "type": "scenario.state",
                        "scenario_id": scenario_id,
                        "status": "running",
                        "progress": (index + 1) / total,
                    }
                )

        if on_state:
            await on_state(
                {"type": "scenario.state", "scenario_id": scenario_id, "status": "finished"}
            )
        self._running_scenario_id = None

    async def start(
        self,
        scenario_id: str,
        emit: EmitCallback,
        *,
        realtime: bool = True,
        on_reset: Callable[[], Awaitable[None]] | None = None,
        on_state: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
    ) -> None:
        await self.stop()
        if on_reset:
            await on_reset()

        async def _runner() -> None:
            try:
                await self.run_scenario(
                    scenario_id,
                    emit,
                    realtime=realtime,
                    on_state=on_state,
                )
            except asyncio.CancelledError:
                self._running_scenario_id = None
                if on_state:
                    await on_state(
                        {
                            "type": "scenario.state",
                            "scenario_id": scenario_id,
                            "status": "stopped",
                        }
                    )
                raise

        if realtime:
            self._task = asyncio.create_task(_runner())
        else:
            await _runner()

    async def stop(self) -> None:
        if self._task is not None and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None
        self._running_scenario_id = None

    async def collect_frames(
        self,
        scenario_id: str,
        *,
        realtime: bool = False,
    ) -> list[TagFrame]:
        frames: list[TagFrame] = []

        async def _emit(frame: TagFrame) -> None:
            frames.append(frame)

        await self.run_scenario(scenario_id, _emit, realtime=realtime)
        return frames