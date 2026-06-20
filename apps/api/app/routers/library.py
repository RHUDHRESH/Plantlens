"""Read-only component library routes."""

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth.dependencies import require_viewer
from app.auth.principal import Principal
from app.library.catalog import (
    get_component,
    group_components_by_category,
    list_components,
    load_standard_component_library,
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