"""Validate a whole authored bundle before it may become a revision.

Two gates, both must pass:
1. JSON Schema (packages/contracts, Draft 2020-12): the same contracts CI validates.
2. Graph compile: known references and the cycle policy (only engineer-flagged loops).
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from app.runtime.graph_compile import validate_and_compile_graph


def _find_contracts_dir() -> Path:
    """packages/contracts: env override, else the nearest ancestor that has it (repo or /)."""
    override = os.environ.get("PLANTLENS_CONTRACTS_DIR")
    if override:
        return Path(override)
    for base in Path(__file__).resolve().parents:
        candidate = base / "packages" / "contracts"
        if candidate.is_dir():
            return candidate
    return Path("/packages/contracts")


CONTRACTS_DIR = _find_contracts_dir()
SCHEMA_FOR_DOC = {
    "plant": "plant.schema.json",
    "tag_map": "tag_map.schema.json",
    "alarm_rules": "alarm_rules.schema.json",
    "causal_graph": "causal_graph.schema.json",
}


@lru_cache(maxsize=8)
def _validator(schema_file: str) -> Draft202012Validator:
    schema = json.loads((CONTRACTS_DIR / schema_file).read_text(encoding="utf-8"))
    return Draft202012Validator(schema)


def validate_bundle(bundle: dict[str, Any]) -> dict[str, Any]:
    """Return {"ok", "schema_errors", "compile_errors", "feedback_loops", "graph_hash"}."""
    schema_errors: list[dict[str, str]] = []
    for doc, schema_file in SCHEMA_FOR_DOC.items():
        if doc not in bundle:
            schema_errors.append({"doc": doc, "path": "/", "message": "document missing"})
            continue
        for error in sorted(_validator(schema_file).iter_errors(bundle[doc]), key=lambda e: list(e.path)):
            schema_errors.append(
                {
                    "doc": doc,
                    "path": "/" + "/".join(str(p) for p in error.absolute_path),
                    "message": error.message[:300],
                }
            )
            if len(schema_errors) >= 50:
                break

    compile_errors: list[dict[str, str]] = []
    feedback_loops: list[dict[str, Any]] = []
    graph_hash = ""
    if all(doc in bundle for doc in SCHEMA_FOR_DOC):
        result = validate_and_compile_graph(
            plant=bundle["plant"],
            tag_map=bundle["tag_map"],
            alarm_rules=bundle["alarm_rules"],
            causal_graph=bundle["causal_graph"],
        )
        compile_errors = [{"field": e.field, "message": e.message, "fix": e.fix} for e in result.errors]
        feedback_loops = result.feedback_loops
        graph_hash = result.graph_hash
        tag_ids = {t["tag"] for t in bundle["tag_map"].get("tags", [])}
        asset_ids = {a["id"] for a in bundle["plant"].get("assets", [])}
        for rule in bundle["alarm_rules"].get("rules", []):
            if rule.get("tag") not in tag_ids:
                compile_errors.append(
                    {"field": f"alarm_rules.{rule.get('id')}", "message": f"Unknown tag {rule.get('tag')}",
                     "fix": "Reference a tag from tag_map.json"}
                )
            if rule.get("asset_id") and rule["asset_id"] not in asset_ids:
                compile_errors.append(
                    {"field": f"alarm_rules.{rule.get('id')}", "message": f"Unknown asset {rule['asset_id']}",
                     "fix": "Reference an asset from plant.json"}
                )

    return {
        "ok": not schema_errors and not compile_errors,
        "schema_errors": schema_errors,
        "compile_errors": compile_errors,
        "feedback_loops": feedback_loops,
        "graph_hash": graph_hash,
    }
