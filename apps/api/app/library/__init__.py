"""Component standard library — deterministic catalog and validation."""

from app.library.catalog import (
    get_component,
    group_components_by_category,
    list_components,
    load_standard_component_library,
)
from app.library.assembly import create_compatibility_report, validate_plant_assembly
from app.library.matrices import build_compatibility_matrix, summarize_compatibility_matrix
from app.library.ports import check_port_compatibility, check_connection_by_type_ids
from app.library.validators import (
    validate_component_library,
    validate_component_template,
    validate_reference_integrity,
    validate_visual_asset,
)

__all__ = [
    "build_compatibility_matrix",
    "check_connection_by_type_ids",
    "check_port_compatibility",
    "create_compatibility_report",
    "get_component",
    "group_components_by_category",
    "list_components",
    "load_standard_component_library",
    "summarize_compatibility_matrix",
    "validate_component_library",
    "validate_component_template",
    "validate_plant_assembly",
    "validate_reference_integrity",
    "validate_visual_asset",
]