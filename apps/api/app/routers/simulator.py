"""Simulator control routes."""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth.dependencies import require_engineer
from app.auth.principal import Principal
from app.runtime.simulator.scenario_runner import (
    InvalidScenarioDataError,
    ScenarioNotFoundError,
    load_scenarios,
)
from app.runtime.simulator.simulator_gateway import get_simulator_gateway
from app.settings import get_settings

router = APIRouter(prefix="/api/scenarios", tags=["simulator"])


def _scenarios_path() -> Path:
    settings = get_settings()
    bundle_dir = Path(settings.sample_data_dir)
    if not bundle_dir.is_absolute():
        bundle_dir = Path(__file__).resolve().parents[2] / settings.sample_data_dir
    return bundle_dir / "scenarios.json"


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