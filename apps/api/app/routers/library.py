"""Component library and assembly validation routes."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth.dependencies import require_viewer
from app.auth.principal import Principal
from app.library.analysis import analyze_plant_assembly, score_plant_faults
from app.library.assembly import validate_plant_assembly
from app.library.catalog import (
    get_component,
    group_components_by_category,
    list_components,
    load_standard_component_library,
)
from app.library.matrices import build_compatibility_matrix, summarize_compatibility_matrix
from app.library.ports import check_connection_by_type_ids
from app.schemas.plant_assembly import (
    AnalyzeAssemblyRequest,
    CheckConnectionRequest,
    ScoreFaultsRequest,
    ValidateAssemblyRequest,
)

router = APIRouter(prefix="/api/library", tags=["library"])


@router.get("/components")
async def list_library_components(
    _principal: Principal = Depends(require_viewer),
) -> dict:
    library = load_standard_component_library()
    components = list_components()
    return {
        "status": "ok",
        "count": len(components),
        "library_id": library.get("library_id"),
        "version": library.get("version"),
        "components": components,
        "categories": group_components_by_category(),
    }


@router.get("/components/{component_type_id}")
async def get_library_component(
    component_type_id: str,
    _principal: Principal = Depends(require_viewer),
) -> dict:
    component = get_component(component_type_id)
    if component is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "component_not_found",
                "message": f"Unknown component_type_id: {component_type_id}",
                "fix": "Use GET /api/library/components to list valid component_type_id values.",
            },
        )
    return {"status": "ok", "component": component}


@router.get("/compatibility-matrix")
async def get_compatibility_matrix(
    _principal: Principal = Depends(require_viewer),
) -> dict[str, Any]:
    library = load_standard_component_library()
    matrix = build_compatibility_matrix(library)
    return {"status": "ok", **summarize_compatibility_matrix(matrix)}


@router.post("/check-connection")
async def check_connection(
    body: CheckConnectionRequest,
    _principal: Principal = Depends(require_viewer),
) -> dict[str, Any]:
    library = load_standard_component_library()
    result = check_connection_by_type_ids(
        library,
        body.from_component_type_id,
        body.from_port_id,
        body.to_component_type_id,
        body.to_port_id,
    )
    return {"status": "ok", **result.to_dict()}


@router.post("/validate-assembly")
async def validate_assembly(
    body: ValidateAssemblyRequest,
    _principal: Principal = Depends(require_viewer),
) -> dict[str, Any]:
    library = body.component_library or load_standard_component_library()
    assembly = body.plant_assembly.model_dump()
    return validate_plant_assembly(assembly, library)


@router.post("/analyze-assembly")
async def analyze_assembly(
    body: AnalyzeAssemblyRequest,
    _principal: Principal = Depends(require_viewer),
) -> dict[str, Any]:
    library = body.component_library or load_standard_component_library()
    assembly = body.plant_assembly.model_dump()
    return analyze_plant_assembly(assembly, library)


@router.post("/score-faults")
async def score_faults(
    body: ScoreFaultsRequest,
    _principal: Principal = Depends(require_viewer),
) -> dict[str, Any]:
    library = body.component_library or load_standard_component_library()
    assembly = body.plant_assembly.model_dump()
    return score_plant_faults(
        assembly,
        library,
        body.observed_signals,
        body.data_quality,
    )