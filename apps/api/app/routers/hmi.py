"""Compiled HMI read routes and deterministic preview projection."""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import ValidationError

from app.auth.dependencies import require_viewer
from app.auth.principal import Principal
from app.hmi.contracts import HMIPreviewRequest, PlantHMIState
from app.hmi.projector import HMIProjectionError, build_hmi_state
from app.hmi.runtime_bridge import build_hmi_state_from_runtime_snapshot
from app.runtime.runtime_state import runtime_state
from app.settings import Settings, get_settings
from app.studio.config_store import load_compiled
from app.studio.compiler import compile_project

router = APIRouter(prefix="/api/hmi", tags=["hmi"])


def _compiled_dir(settings: Settings) -> Path:
    compiled_dir = Path(settings.compiled_dir)
    if not compiled_dir.is_absolute():
        compiled_dir = Path(__file__).resolve().parents[2] / settings.compiled_dir
    return compiled_dir


def _sample_data_dir(settings: Settings) -> Path:
    sample_data_dir = Path(settings.sample_data_dir)
    if not sample_data_dir.is_absolute():
        sample_data_dir = Path(__file__).resolve().parents[2] / settings.sample_data_dir
    return sample_data_dir


@router.get("/compiled")
async def get_compiled_bundle(
    _principal: Principal = Depends(require_viewer),
    settings: Settings = Depends(get_settings),
) -> dict:
    compiled_dir = _compiled_dir(settings)
    plant_id = settings.active_plant_id
    compiled = load_compiled(compiled_dir, plant_id)
    if compiled is None:
        result = compile_project(
            plant_id=plant_id,
            sample_data_dir=_sample_data_dir(settings),
            compiled_dir=compiled_dir,
        )
        if result.get("status") != "ok":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "code": "compiled_missing",
                    "message": "No compiled bundle available",
                    "fix": "Run POST /api/compiler/compile as an engineer to generate compiled_hmi.json.",
                    "errors": result.get("errors", []),
                },
            )
        compiled = result["compiled"]
    return compiled


@router.get("/runtime", response_model=PlantHMIState)
async def get_runtime_hmi_state(
    _principal: Principal = Depends(require_viewer),
    settings: Settings = Depends(get_settings),
) -> PlantHMIState:
    """Project the live runtime snapshot into a frontend-ready HMI state."""
    compiled_dir = _compiled_dir(settings)
    plant_id = settings.active_plant_id
    compiled = load_compiled(compiled_dir, plant_id)
    return build_hmi_state_from_runtime_snapshot(
        plant_id=plant_id,
        run_id="runtime_live",
        runtime_snapshot=runtime_state.snapshot(),
        compiled_bundle=compiled,
    )


@router.post("/preview", response_model=PlantHMIState)
async def preview_hmi_state(
    request: HMIPreviewRequest,
    _principal: Principal = Depends(require_viewer),
) -> PlantHMIState:
    """Project a canonical bench payload into a frontend-ready HMI state."""
    try:
        return build_hmi_state(
            canonical_payload=request.canonical_payload,
            gate_results=request.gate_results,
            now=request.generated_at,
        )
    except HMIProjectionError as exc:
        raise _projection_http_error(str(exc)) from exc
    except ValueError as exc:
        raise _projection_http_error(str(exc)) from exc
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=exc.errors(),
        ) from exc


def _projection_http_error(message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={
            "code": "hmi_projection_failed",
            "message": message,
            "fix": "Verify canonical payload assets, signals, causality edges, and gate results.",
        },
    )