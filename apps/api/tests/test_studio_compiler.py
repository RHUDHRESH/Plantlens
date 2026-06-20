"""Studio compiler tests (Prompts 23-24 + chunks 1-4 red-team hardening)."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

from app.studio.compiler import compile_authored_bundle, compile_project
from app.studio.config_store import load_compiled
from app.studio.graph_checks import check_acyclic
from app.studio.validators import validate_references

REPO_ROOT = Path(__file__).resolve().parents[3]
DEMO_DIR = REPO_ROOT / "packages" / "sample-data" / "demo-microgrid"
API_ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def compiled_dir(tmp_path: Path) -> Path:
    return tmp_path / "compiled"


def _load_demo_bundle() -> dict:
    return {
        "plant": json.loads((DEMO_DIR / "plant.json").read_text(encoding="utf-8")),
        "tag_map": json.loads((DEMO_DIR / "tag_map.json").read_text(encoding="utf-8")),
        "alarm_rules": json.loads((DEMO_DIR / "alarm_rules.json").read_text(encoding="utf-8")),
        "causal_graph": json.loads((DEMO_DIR / "causal_graph.json").read_text(encoding="utf-8")),
        "scenarios": json.loads((DEMO_DIR / "scenarios.json").read_text(encoding="utf-8")),
        "action_envelope": {},
    }


def test_demo_compile_success(compiled_dir: Path):
    result = compile_project(
        plant_id="demo_microgrid_001",
        sample_data_dir=DEMO_DIR,
        compiled_dir=compiled_dir,
    )
    assert result["status"] == "ok"
    assert result["compiled"]["content_hash"]
    saved = load_compiled(compiled_dir, "demo_microgrid_001")
    assert saved is not None
    assert "map_2d" in saved["hmi_view_model"]


def test_unknown_ref_structured_error(compiled_dir: Path):
    bundle = _load_demo_bundle()
    bundle["alarm_rules"]["rules"][0]["tag"] = "DOES_NOT_EXIST"
    issues = validate_references(bundle)
    assert issues
    assert issues[0].code == "UNKNOWN_TAG_REF"
    assert issues[0].fix


def test_cycle_rejection(compiled_dir: Path):
    bundle = _load_demo_bundle()
    bundle["causal_graph"]["edges"].append(
        {"id": "CYCLE", "from": "INV-102", "to": "PV-101", "approved": True, "lag_ms": [0, 1000]}
    )
    issues = check_acyclic(bundle)
    assert issues
    assert issues[0].code == "GRAPH_HAS_CYCLE"


def test_deterministic_hash(compiled_dir: Path):
    first = compile_project(
        plant_id="demo_microgrid_001",
        sample_data_dir=DEMO_DIR,
        compiled_dir=compiled_dir,
    )
    second = compile_project(
        plant_id="demo_microgrid_001",
        sample_data_dir=DEMO_DIR,
        compiled_dir=compiled_dir,
    )
    assert first["compiled"]["content_hash"] == second["compiled"]["content_hash"]


def test_fail_closed_preserves_last_good(compiled_dir: Path):
    good = compile_project(
        plant_id="demo_microgrid_001",
        sample_data_dir=DEMO_DIR,
        compiled_dir=compiled_dir,
    )
    good_hash = good["compiled"]["content_hash"]

    broken_bundle = _load_demo_bundle()
    broken_bundle["alarm_rules"]["rules"][0]["tag"] = "MISSING_TAG"

    result = compile_authored_bundle(
        plant_id="demo_microgrid_001",
        bundle=broken_bundle,
        compiled_dir=compiled_dir,
    )

    assert result["status"] == "error"
    assert result["previous_hash"] == good_hash
    assert any(error["code"] == "UNKNOWN_TAG_REF" for error in result["errors"])
    assert load_compiled(compiled_dir, "demo_microgrid_001")["content_hash"] == good_hash


def test_invalid_bundle_does_not_create_compiled_file_when_no_previous_good(compiled_dir: Path):
    broken_bundle = _load_demo_bundle()
    broken_bundle["tag_map"]["tags"][0]["asset_id"] = "DOES-NOT-EXIST"

    result = compile_authored_bundle(
        plant_id="demo_microgrid_001",
        bundle=broken_bundle,
        compiled_dir=compiled_dir,
    )

    assert result["status"] == "error"
    assert result["previous_hash"] is None
    assert any(error["code"] == "UNKNOWN_ASSET_REF" for error in result["errors"])
    assert load_compiled(compiled_dir, "demo_microgrid_001") is None


def test_unapproved_edges_are_not_runtime_traversable(compiled_dir: Path):
    result = compile_authored_bundle(
        plant_id="demo_microgrid_001",
        bundle=_load_demo_bundle(),
        compiled_dir=compiled_dir,
    )

    assert result["status"] == "ok"
    graph_index = result["compiled"]["graph_index"]
    approved_edge_ids = {edge["id"] for edge in graph_index["approved_edges"]}
    reverse_edge_ids = {
        edge["id"]
        for edges in graph_index["reverse_adjacency"].values()
        for edge in edges
    }
    assert "E_UNAPPROVED" not in approved_edge_ids
    assert "E_UNAPPROVED" not in reverse_edge_ids


def test_compiled_hmi_view_model_has_usable_2d_nodes_and_edges(compiled_dir: Path):
    result = compile_authored_bundle(
        plant_id="demo_microgrid_001",
        bundle=_load_demo_bundle(),
        compiled_dir=compiled_dir,
    )

    assert result["status"] == "ok"
    hmi = result["compiled"]["hmi_view_model"]
    assert hmi["layout"]["default_view"] == "2d"
    assert hmi["map_2d"]["nodes"]
    assert hmi["map_2d"]["edges"]
    first_node = hmi["map_2d"]["nodes"][0]
    assert {"id", "label", "asset_type", "tags", "alarms", "status_binding"}.issubset(first_node)


def test_compiler_does_not_import_runtime_simulator():
    script = (
        "import sys; "
        "import app.studio.compiler; "
        "mods = sorted(m for m in sys.modules if m.startswith('app.runtime.simulator')); "
        "print(mods)"
    )
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=API_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.stdout.strip() == "[]"
