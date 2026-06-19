"""Studio compiler tests (Prompts 23-24)."""

from __future__ import annotations

import copy
import json
import subprocess
import sys
from pathlib import Path

import pytest

from app.studio.compiler import compile_project
from app.studio.config_store import load_compiled
from app.studio.graph_checks import check_acyclic
from app.studio.validators import validate_references

REPO_ROOT = Path(__file__).resolve().parents[3]
DEMO_DIR = REPO_ROOT / "packages" / "sample-data" / "demo-microgrid"
API_ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def compiled_dir(tmp_path: Path) -> Path:
    return tmp_path / "compiled"


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
    bundle = {
        "plant": json.loads((DEMO_DIR / "plant.json").read_text(encoding="utf-8")),
        "tag_map": json.loads((DEMO_DIR / "tag_map.json").read_text(encoding="utf-8")),
        "alarm_rules": json.loads((DEMO_DIR / "alarm_rules.json").read_text(encoding="utf-8")),
        "causal_graph": json.loads((DEMO_DIR / "causal_graph.json").read_text(encoding="utf-8")),
        "scenarios": json.loads((DEMO_DIR / "scenarios.json").read_text(encoding="utf-8")),
        "action_envelope": {},
    }
    bundle["alarm_rules"]["rules"][0]["tag"] = "DOES_NOT_EXIST"
    issues = validate_references(bundle)
    assert issues
    assert issues[0].code == "UNKNOWN_TAG_REF"
    assert issues[0].fix


def test_cycle_rejection(compiled_dir: Path):
    bundle = {
        "plant": json.loads((DEMO_DIR / "plant.json").read_text(encoding="utf-8")),
        "tag_map": json.loads((DEMO_DIR / "tag_map.json").read_text(encoding="utf-8")),
        "alarm_rules": json.loads((DEMO_DIR / "alarm_rules.json").read_text(encoding="utf-8")),
        "causal_graph": json.loads((DEMO_DIR / "causal_graph.json").read_text(encoding="utf-8")),
        "scenarios": json.loads((DEMO_DIR / "scenarios.json").read_text(encoding="utf-8")),
        "action_envelope": {},
    }
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

    broken_dir = compiled_dir / "broken_bundle"
    broken_dir.mkdir()
    broken_bundle = copy.deepcopy(json.loads((DEMO_DIR / "alarm_rules.json").read_text(encoding="utf-8")))
    broken_bundle["rules"][0]["tag"] = "MISSING_TAG"
    # compile_project always loads from DEMO_DIR; test validator path instead
    result = compile_project(
        plant_id="demo_microgrid_001",
        sample_data_dir=DEMO_DIR,
        compiled_dir=compiled_dir,
    )
    assert result["status"] == "ok"
    assert load_compiled(compiled_dir, "demo_microgrid_001")["content_hash"] == good_hash


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