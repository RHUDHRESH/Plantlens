"""Simulator control routes."""

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth.dependencies import require_engineer
from app.auth.principal import Principal
from app.runtime.simulator.scenario_runner import (
    InvalidScenarioDataError,
    ScenarioNotFoundError,
)
from app.runtime.simulator.simulator_gateway import get_simulator_gateway

router = APIRouter(prefix="/api/scenarios", tags=["simulator"])


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