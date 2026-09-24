"""Causal pattern library loader (packages/sample-data/component-library/causal_patterns)."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.library.catalog import sample_data_dir


def patterns_dir() -> Path:
    return sample_data_dir() / "causal_patterns"


@lru_cache(maxsize=4)
def _load(directory: str) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    """(libraries by component_type, patterns by pattern_id with a back-reference)."""
    libraries: dict[str, dict[str, Any]] = {}
    patterns: dict[str, dict[str, Any]] = {}
    base = Path(directory)
    if not base.is_dir():
        return libraries, patterns
    for path in sorted(base.glob("*.json")):
        library = json.loads(path.read_text(encoding="utf-8"))
        libraries[library["component_type"]] = library
        for pattern in library["patterns"]:
            patterns[pattern["pattern_id"]] = {**pattern, "_component_type": library["component_type"]}
    return libraries, patterns


def load_libraries() -> dict[str, dict[str, Any]]:
    return _load(str(patterns_dir()))[0]


def get_pattern(pattern_id: str) -> dict[str, Any] | None:
    return _load(str(patterns_dir()))[1].get(pattern_id)


def library_for_pattern(pattern_id: str) -> dict[str, Any] | None:
    pattern = get_pattern(pattern_id)
    if pattern is None:
        return None
    return load_libraries().get(pattern["_component_type"])


def libraries_for_asset_type(asset_type: str) -> list[dict[str, Any]]:
    """Libraries whose asset_type_aliases include a plant.schema asset type."""
    return [lib for lib in load_libraries().values() if asset_type in lib.get("asset_type_aliases", [])]


def summarize_library(library: dict[str, Any]) -> dict[str, Any]:
    return {
        "component_type": library["component_type"],
        "display_name": library.get("display_name", library["component_type"]),
        "description": library.get("description", ""),
        "asset_type_aliases": library.get("asset_type_aliases", []),
        "pattern_count": len(library["patterns"]),
        "patterns": [
            {
                "pattern_id": p["pattern_id"],
                "title": p["title"],
                "category": p["category"],
                "severity": p["severity"],
                "required_roles": p["required_roles"],
            }
            for p in library["patterns"]
        ],
    }


def reset_pattern_cache_for_tests() -> None:
    _load.cache_clear()
