"""HMI compiler — pure function: model files in -> screen JSON out (Domain K).

Recompiles on model change (file hash -> cache bust). Must be a pure function
so screens are reproducible and diffable. Same asset type -> same screen
everywhere (consistency-by-construction).
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from ..config import MODELS_DIR


def _hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12] if path.exists() else ""


def compile_screens() -> dict:
    """Compile all screens from model files (scaffold: returns template registry + hash)."""
    templates = MODELS_DIR / "templates.json"
    plant = MODELS_DIR / "plant.json"
    return {
        "cache_key": _hash(templates) + _hash(plant),
        "screens": json.loads(templates.read_text(encoding="utf-8"))["templates"]
                   if templates.exists() else [],
    }
