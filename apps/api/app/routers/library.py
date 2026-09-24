"""Component library and assembly validation routes."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_engineer, require_viewer
from app.auth.principal import Principal
from app.library.analysis import analyze_plant_assembly, score_plant_faults
from app.library.assembly import validate_plant_assembly
from app.library.catalog import (
    get_component,
    group_components_by_category,
    list_components,
    load_standard_component_library,
)
from app.changes import service as change_service
from app.dependencies import get_db
from app.library.instantiate import PatternInstantiationError, instantiate_pattern
from app.library.patterns import (
    get_pattern,
    libraries_for_asset_type,
    library_for_pattern,
    load_libraries,
    summarize_library,
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

# --- Causal pattern library ---------------------------------------------------------------


class InstantiatePatternRequest(BaseModel):
    asset_id: str
    bindings: dict[str, str] | None = None
    neighbours: dict[str, list[str]] | None = None
    submit: bool = Field(default=False, description="Also submit the draft to the change review queue.")


def _bundle_parts(bundle: dict[str, Any]) -> dict[str, Any]:
    return {
        "plant": bundle["plant"],
        "tag_map": bundle["tag_map"],
        "causal_graph": bundle["causal_graph"],
        "alarm_rules": bundle["alarm_rules"],
    }


@router.get("/patterns")
async def list_pattern_libraries(
    _principal: Principal = Depends(require_viewer),
) -> dict[str, Any]:
    libraries = [summarize_library(lib) for lib in load_libraries().values()]
    return {
        "libraries": sorted(libraries, key=lambda lib: lib["component_type"]),
        "pattern_count": sum(lib["pattern_count"] for lib in libraries),
    }


@router.get("/patterns/coverage/{asset_id}")
async def pattern_coverage_for_asset(
    asset_id: str,
    _principal: Principal = Depends(require_viewer),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Which failure modes of this asset are observable with today's instrumentation."""
    revision = await change_service.ensure_seed_revision(session)
    await session.commit()
    bundle = _bundle_parts(revision.bundle_json)
    asset = next((a for a in bundle["plant"].get("assets", []) if a["id"] == asset_id), None)
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown asset {asset_id}")
    rows: list[dict[str, Any]] = []
    for library in libraries_for_asset_type(asset.get("type", "")):
        for pattern in library["patterns"]:
            result = instantiate_pattern(pattern, library, asset_id=asset_id, **bundle)
            rows.append(
                {
                    "pattern_id": pattern["pattern_id"],
                    "title": pattern["title"],
                    "category": pattern["category"],
                    "severity": pattern["severity"],
                    "observable": result.ok,
                    "missing_required": result.missing_required,
                    "missing_optional": result.missing_optional,
                    "unresolved": result.unresolved,
                }
            )
    observable = sum(1 for r in rows if r["observable"])
    return {
        "asset_id": asset_id,
        "asset_type": asset.get("type"),
        "bundle_rev": revision.rev,
        "observable": observable,
        "total": len(rows),
        "patterns": rows,
    }


@router.get("/patterns/{pattern_id}")
async def get_causal_pattern(
    pattern_id: str,
    _principal: Principal = Depends(require_viewer),
) -> dict[str, Any]:
    pattern = get_pattern(pattern_id)
    if pattern is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown pattern {pattern_id}")
    library = library_for_pattern(pattern_id) or {}
    return {
        "pattern": {k: v for k, v in pattern.items() if not k.startswith("_")},
        "component_type": pattern["_component_type"],
        "roles": library.get("roles", []),
    }


@router.post("/patterns/{pattern_id}/instantiate")
async def instantiate_causal_pattern(
    pattern_id: str,
    body: InstantiatePatternRequest,
    principal: Principal = Depends(require_engineer),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    pattern = get_pattern(pattern_id)
    library = library_for_pattern(pattern_id)
    if pattern is None or library is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown pattern {pattern_id}")
    revision = await change_service.ensure_seed_revision(session)
    try:
        result = instantiate_pattern(
            pattern,
            library,
            asset_id=body.asset_id,
            bindings=body.bindings,
            neighbours=body.neighbours,
            **_bundle_parts(revision.bundle_json),
        )
    except PatternInstantiationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    payload: dict[str, Any] = {"result": result.to_dict(), "bundle_rev": revision.rev, "change": None}
    if body.submit and result.change_set is not None:
        row = await change_service.submit_change(session, result.change_set, principal)
        payload["change"] = change_service.serialize_change(row)
    await session.commit()
    return payload
