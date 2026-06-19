"""Compiled HMI read routes."""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth.dependencies import require_viewer
from app.auth.principal import Principal
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