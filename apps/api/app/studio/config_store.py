"""File-backed authored and compiled bundle storage."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

import yaml


def _bundle_dir(sample_data_dir: Path) -> Path:
    return sample_data_dir


def load_authored(sample_data_dir: Path) -> dict[str, Any]:
    base = _bundle_dir(sample_data_dir)
    return {
        "plant": json.loads((base / "plant.json").read_text(encoding="utf-8")),
        "tag_map": json.loads((base / "tag_map.json").read_text(encoding="utf-8")),
        "alarm_rules": json.loads((base / "alarm_rules.json").read_text(encoding="utf-8")),
        "causal_graph": json.loads((base / "causal_graph.json").read_text(encoding="utf-8")),
        "scenarios": json.loads((base / "scenarios.json").read_text(encoding="utf-8")),
        "action_envelope": yaml.safe_load((base / "action_envelope.yaml").read_text(encoding="utf-8")),
    }


def load_compiled(compiled_dir: Path, plant_id: str) -> dict[str, Any] | None:
    path = compiled_dir / plant_id / "compiled_hmi.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def save_compiled(compiled_dir: Path, plant_id: str, compiled: dict[str, Any]) -> Path:
    target_dir = compiled_dir / plant_id
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / "compiled_hmi.json"
    fd, tmp_name = tempfile.mkstemp(dir=target_dir, suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(compiled, handle, indent=2, sort_keys=True)
            handle.write("\n")
        os.replace(tmp_name, target)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)
    return target


def list_versions(compiled_dir: Path, plant_id: str) -> list[str]:
    path = compiled_dir / plant_id / "compiled_hmi.json"
    return [path.name] if path.exists() else []