"""Studio compiler routes."""

from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends

from app.auth.dependencies import require_engineer, require_viewer
from app.auth.principal import Principal
from app.settings import Settings, get_settings
from app.studio.compiler import compile_authored_bundle, compile_project
from app.studio.config_store import load_authored

router = APIRouter(prefix="/api/compiler", tags=["compiler"])


@router.post("/compile")
async def compile_bundle(
    _principal: Principal = Depends(require_engineer),
    settings: Settings = Depends(get_settings),
) -> dict:
    sample_data_dir = Path(settings.sample_data_dir)
    if not sample_data_dir.is_absolute():
        sample_data_dir = Path(__file__).resolve().parents[2] / settings.sample_data_dir
    compiled_dir = Path(settings.compiled_dir)
    if not compiled_dir.is_absolute():
        compiled_dir = Path(__file__).resolve().parents[2] / settings.compiled_dir
    return compile_project(
        plant_id=settings.active_plant_id,
        sample_data_dir=sample_data_dir,
        compiled_dir=compiled_dir,
    )


@router.get("/authored")
async def get_authored_bundle(
    _principal: Principal = Depends(require_viewer),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    sample_data_dir = Path(settings.sample_data_dir)
    if not sample_data_dir.is_absolute():
        sample_data_dir = Path(__file__).resolve().parents[2] / settings.sample_data_dir
    return load_authored(sample_data_dir)


@router.post("/compile-bundle")
async def compile_submitted_bundle(
    bundle: dict[str, Any],
    _principal: Principal = Depends(require_engineer),
    settings: Settings = Depends(get_settings),
) -> dict:
    compiled_dir = Path(settings.compiled_dir)
    if not compiled_dir.is_absolute():
        compiled_dir = Path(__file__).resolve().parents[2] / settings.compiled_dir
    return compile_authored_bundle(
        plant_id=settings.active_plant_id,
        bundle=bundle,
        compiled_dir=compiled_dir,
    )