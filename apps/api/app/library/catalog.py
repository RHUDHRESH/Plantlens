"""Load and query the standard component library."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.library.validators import validate_component_library
from app.settings import get_settings

_LIBRARY_FILENAME = "standard_components.json"


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def component_library_path() -> Path:
    settings = get_settings()
    configured = Path(settings.component_library_dir)
    if configured.is_absolute():
        return configured / _LIBRARY_FILENAME
    return _repo_root() / settings.component_library_dir / _LIBRARY_FILENAME


@lru_cache
def load_standard_component_library() -> dict[str, Any]:
    path = component_library_path()
    if not path.is_file():
        raise FileNotFoundError(f"component library not found: {path}")
    with path.open(encoding="utf-8") as handle:
        library = json.load(handle)
    validate_component_library(library)
    return library


def list_components() -> list[dict[str, Any]]:
    return list(load_standard_component_library()["components"])


def get_component(component_type_id: str) -> dict[str, Any] | None:
    for component in list_components():
        if component["component_type_id"] == component_type_id:
            return component
    return None


def group_components_by_category() -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for component in list_components():
        category = component["category"]
        grouped.setdefault(category, []).append(component)
    return grouped