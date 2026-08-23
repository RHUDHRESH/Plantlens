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


def save_authored_causal_graph(sample_data_dir: Path, causal_graph: dict[str, Any]) -> Path:
    """Atomically write causal_graph.json back to the authored bundle directory."""
    target = sample_data_dir / "causal_graph.json"
    fd, tmp_name = tempfile.mkstemp(dir=sample_data_dir, suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(causal_graph, handle, indent=2)
            handle.write("\n")
        os.replace(tmp_name, target)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)
    return target


def promote_compiled_from_temp(
    *,
    temp_compiled_dir: Path,
    live_compiled_dir: Path,
    plant_id: str,
) -> Path:
    """Copy a validated temp compile into the live compiled directory (atomic replace)."""
    src = temp_compiled_dir / plant_id / "compiled_hmi.json"
    if not src.exists():
        raise FileNotFoundError(f"Temp compiled bundle missing: {src}")
    compiled = json.loads(src.read_text(encoding="utf-8"))
    return save_compiled(live_compiled_dir, plant_id, compiled)


def atomic_promote_approval(
    *,
    sample_data_dir: Path,
    live_compiled_dir: Path,
    temp_compiled_dir: Path,
    plant_id: str,
    causal_graph: dict[str, Any],
) -> tuple[Path, Path]:
    """Promote authored + compiled together; roll back authored on compiled-write failure.

    Prevents compiled-approved vs authored-unapproved desync when the second write fails.
    """
    authored_path = sample_data_dir / "causal_graph.json"
    authored_backup = json.loads(authored_path.read_text(encoding="utf-8"))
    authored_written = save_authored_causal_graph(sample_data_dir, causal_graph)
    try:
        compiled_written = promote_compiled_from_temp(
            temp_compiled_dir=temp_compiled_dir,
            live_compiled_dir=live_compiled_dir,
            plant_id=plant_id,
        )
    except Exception:
        # Restore last-known authored graph so disks stay aligned.
        save_authored_causal_graph(sample_data_dir, authored_backup)
        raise
    return authored_written, compiled_written