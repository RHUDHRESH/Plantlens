"""Simulator control routes."""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth.dependencies import require_engineer
from app.auth.principal import Principal
from app.runtime.simulator.recorded_playback import (
    replay_recording,
    resolve_recording_path,
)
from app.runtime.simulator.scenario_runner import (
    InvalidScenarioDataError,
    ScenarioNotFoundError,
    load_scenarios,
)
from app.runtime.simulator.simulator_gateway import get_simulator_gateway
from app.settings import Settings, get_settings

router = APIRouter(prefix="/api/scenarios", tags=["simulator"])


class PlaybackRequest(BaseModel):
    recording_id: str = Field(..., min_length=1, max_length=200)
    realtime: bool = False
    reset: bool = True


def _bundle_dir(settings: Settings | None = None) -> Path:
    cfg = settings or get_settings()
    bundle_dir = Path(cfg.sample_data_dir)
    if not bundle_dir.is_absolute():
        bundle_dir = Path(__file__).resolve().parents[2] / cfg.sample_data_dir
    return bundle_dir


def _scenarios_path() -> Path:
    return _bundle_dir() / "scenarios.json"


@router.get("")
async def list_scenarios(
    _principal: Principal = Depends(require_engineer),
) -> dict:
    gateway = get_simulator_gateway()
    doc = load_scenarios(_scenarios_path())
    scenarios = [
        {
            "id": scenario["id"],
            "name": scenario.get("name", scenario["id"]),
            "description": scenario.get("description"),
            "duration_ms": scenario.get("duration_ms"),
            "expected_situation": scenario.get("expected_situation"),
            "expected_root_cause": scenario.get("expected_root_cause"),
        }
        for scenario in doc.get("scenarios", [])
    ]
    running = gateway._runner.running_scenario_id  # noqa: SLF001 — demo control surface
    return {"scenarios": scenarios, "running_scenario_id": running}


@router.post("/{scenario_id}/start")
async def start_scenario(
    scenario_id: str,
    _principal: Principal = Depends(require_engineer),
) -> dict[str, str]:
    gateway = get_simulator_gateway()
    try:
        await gateway.start(scenario_id, realtime=False)
    except ScenarioNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SCENARIO_NOT_FOUND", "message": str(exc)},
        ) from exc
    except InvalidScenarioDataError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_SCENARIO", "message": str(exc)},
        ) from exc
    return {"status": "started", "scenario_id": scenario_id}


@router.post("/stop")
async def stop_scenario(
    _principal: Principal = Depends(require_engineer),
) -> dict[str, str]:
    await get_simulator_gateway().stop()
    return {"status": "stopped"}


@router.post("/playback")
async def playback_recording(
    body: PlaybackRequest,
    _principal: Principal = Depends(require_engineer),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Replay a recorded TagFrame JSONL into SimulatorGateway.on_frame."""
    gateway = get_simulator_gateway()
    try:
        path = resolve_recording_path(_bundle_dir(settings), body.recording_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "RECORDING_NOT_FOUND", "message": str(exc)},
        ) from exc

    if body.reset:
        gateway._state.reset()  # noqa: SLF001 — demo control surface
        from app.runtime.alarm_engine import reset_alarm_engine_state
        from app.runtime.projection import reset_projection_history
        from app.runtime.situation_audit import reset_situation_audit_for_tests

        reset_alarm_engine_state()
        reset_projection_history()
        reset_situation_audit_for_tests()

    result = await replay_recording(
        path,
        gateway.on_frame,
        realtime=body.realtime,
    )
    await gateway._finalize_tick()  # noqa: SLF001 — match scenario start finalize
    snapshot = gateway._state.snapshot()  # noqa: SLF001
    return {
        "status": "played",
        **result,
        "active_situation_ids": [
            s.get("situation_id") for s in snapshot.get("active_situations", [])
        ],
    }
