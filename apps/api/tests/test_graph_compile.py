"""Causal graph compile/validation tests."""

from __future__ import annotations

import json
from pathlib import Path

from app.runtime.graph_compile import validate_and_compile_graph

REPO_ROOT = Path(__file__).resolve().parents[3]
DEMO_DIR = REPO_ROOT / "packages" / "sample-data" / "demo-microgrid"


def _load():
    return (
        json.loads((DEMO_DIR / "plant.json").read_text(encoding="utf-8")),
        json.loads((DEMO_DIR / "tag_map.json").read_text(encoding="utf-8")),
        json.loads((DEMO_DIR / "alarm_rules.json").read_text(encoding="utf-8")),
        json.loads((DEMO_DIR / "causal_graph.json").read_text(encoding="utf-8")),
    )


def test_valid_graph_compiles():
    plant, tag_map, alarm_rules, causal_graph = _load()
    result = validate_and_compile_graph(
        plant=plant,
        tag_map=tag_map,
        alarm_rules=alarm_rules,
        causal_graph=causal_graph,
    )
    assert result.ok
    assert result.graph_hash
    assert "E1" in result.approved_edge_index


def test_cycle_fails():
    plant, tag_map, alarm_rules, causal_graph = _load()
    causal_graph = json.loads(json.dumps(causal_graph))
    causal_graph["edges"].append(
        {
            "id": "E_CYCLE",
            "from": "INV-102",
            "to": "PV-101",
            "edge_type": "test",
            "approved": True,
            "lag_ms": [0, 1000],
            "weight": 1.0,
        }
    )
    result = validate_and_compile_graph(
        plant=plant,
        tag_map=tag_map,
        alarm_rules=alarm_rules,
        causal_graph=causal_graph,
    )
    assert not result.ok
    assert any("Cycle" in e.message for e in result.errors)


def test_unknown_asset_fails():
    plant, tag_map, alarm_rules, causal_graph = _load()
    causal_graph = json.loads(json.dumps(causal_graph))
    causal_graph["nodes"].append({"id": "GHOST-1", "kind": "asset", "evidence_tags": []})
    result = validate_and_compile_graph(
        plant=plant,
        tag_map=tag_map,
        alarm_rules=alarm_rules,
        causal_graph=causal_graph,
    )
    assert not result.ok


def test_unapproved_edge_excluded_from_index():
    plant, tag_map, alarm_rules, causal_graph = _load()
    result = validate_and_compile_graph(
        plant=plant,
        tag_map=tag_map,
        alarm_rules=alarm_rules,
        causal_graph=causal_graph,
    )
    assert "E_UNAPPROVED" not in result.approved_edge_index