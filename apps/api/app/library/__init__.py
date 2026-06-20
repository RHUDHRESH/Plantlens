"""Component standard library — deterministic catalog and validation."""

from app.library.catalog import (
    get_component,
    group_components_by_category,
    list_components,
    load_standard_component_library,
)
from app.library.validators import (
    validate_component_library,
    validate_component_template,
    validate_reference_integrity,
    validate_visual_asset,
)

__all__ = [
    "get_component",
    "group_components_by_category",
    "list_components",
    "load_standard_component_library",
    "validate_component_library",
    "validate_component_template",
    "validate_reference_integrity",
    "validate_visual_asset",
]