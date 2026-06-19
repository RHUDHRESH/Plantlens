"""DAG runtime tests (Prompts 19-20)."""

from __future__ import annotations

import copy
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

from app.runtime.config_loader import load_runtime_config
from app.runtime.dag_runtime import (
    Candidate,
    diagnose,
    evaluate_node_fingerprint,
    violates_temporal_window,
)
from app.runtime.situation_engine import evaluate_situations
from app.runtime.config_loader import GraphEdge
from app.runtime.runtime_state import RuntimeState
from app.schemas.tag_frame import TagFrame

REPO_ROOT = Path(__file__).resolve().parents[3]
DEMO_DIR = REPO_ROOT / "packages" / "sample-data" / "demo-microgrid"
API_ROOT = Path(__file__).resolve().parents[1]
TS = datetime(2026, 6, 18, 12, 0, 0, tzinfo=timezone.utc)


@pytest.fixture
def graph_index():
    config = load_runtime_config("demo", sample_data_dir=DEMO_DIR)
    return config.graph_index


def _motor_overload_alarms() -> dict[str, dict]:
    return {
        "MOTOR_CURRENT_HIGH": {
            "alarm_id": "MOTOR_CURRENT_HIGH",
            "asset_id": "MTR-301",
            "tag_id": "MOTOR_301_CURRENT",
            "raised_at": "2026-06-18T12:00:02Z",
            "severity": "warning",
            "message": "Motor current high",
        },
        "MOTOR_SPEED_LOW": {
            "alarm_id": "MOTOR_SPEED_LOW",
            "asset_id": "MTR-301",
            "tag_id": "MOTOR_301_RPM",
            "raised_at": "2026-06-18T12:00:04Z",
            "severity": "warning",
            "message": "Motor speed low",
        },
        "DC_BUS_LOW": {
            "alarm_id": "DC_BUS_LOW",
            "asset_id": "BUS-101",
            "tag_id": "BUS_101_V",
            "raised_at": "2026-06-18T12:00:06Z",
            "severity": "critical",
            "message": "DC bus voltage low",
        },
        "INV_UNDERVOLTAGE": {
            "alarm_id": "INV_UNDERVOLTAGE",
            "asset_id": "INV-102",
            "tag_id": "INV_102_UNDERVOLTAGE",
            "raised_at": "2026-06-18T12:00:07.500Z",
            "severity": "warning",
            "message": "Inverter undervoltage active",
        },
    }


def test_motor_overload_ranks_mtr_301_first(graph_index):
    state = RuntimeState()
    state.active_alarms = _motor_overload_alarms()
    candidates = diagnose("MOTOR_CURRENT_HIGH", graph_index, state)
    assert candidates
    assert candidates[0].node_id == "MTR-301"


def test_unapproved_edge_excluded(graph_index):
    modified = copy.deepcopy(graph_index)
    for edge in modified["reverse_adjacency"].get("BUS-101", []):
        if edge.from_node == "MTR-301":
            edge.approved = False
    state = RuntimeState()
    state.active_alarms = _motor_overload_alarms()
    candidates = diagnose("DC_BUS_LOW", modified, state)
    assert all(candidate.node_id != "MTR-301" or candidate.score < 0.2 for candidate in candidates)


def test_late_event_outside_lag_window():
    edge = GraphEdge(
        id="E5",
        from_node="MTR-301",
        to_node="BUS-101",
        approved=True,
        lag_ms=(0, 1000),
        edge_type="structural_load_effect",
    )
    cause_ts = datetime(2026, 6, 18, 12, 0, 0, tzinfo=timezone.utc)
    effect_ts = datetime(2026, 6, 18, 12, 0, 5, tzinfo=timezone.utc)
    assert violates_temporal_window(edge, cause_ts, effect_ts)


def test_deterministic_ranking(graph_index):
    state = RuntimeState()
    state.active_alarms = _motor_overload_alarms()
    first = diagnose("MOTOR_CURRENT_HIGH", graph_index, state)
    second = diagnose("MOTOR_CURRENT_HIGH", graph_index, state)
    assert [(c.node_id, c.score) for c in first] == [(c.node_id, c.score) for c in second]


def test_graph_object_not_mutated(graph_index):
    before = json.dumps(graph_index, sort_keys=True, default=str)
    state = RuntimeState()
    state.active_alarms = _motor_overload_alarms()
    diagnose("MOTOR_CURRENT_HIGH", graph_index, state)
    after = json.dumps(graph_index, sort_keys=True, default=str)
    assert before == after


def test_malformed_graph_fails_closed():
    state = RuntimeState()
    state.active_alarms = _motor_overload_alarms()
    candidates = diagnose("MOTOR_CURRENT_HIGH", {"nodes": {}, "reverse_adjacency": {}}, state)
    assert candidates == [] or isinstance(candidates[0], Candidate)


def test_dag_runtime_does_not_import_simulator_or_agents():
    script = (
        "import sys; "
        "import app.runtime.dag_runtime; "
        "mods = sorted(m for m in sys.modules if m.startswith(('app.runtime.simulator', 'app.agents'))); "
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


def test_pv_generation_loss_situation_from_config(graph_index):
    state = RuntimeState()
    state.active_alarms = {
        "DC_BUS_LOW": {
            "alarm_id": "DC_BUS_LOW",
            "asset_id": "BUS-101",
            "tag_id": "BUS_101_V",
            "raised_at": "2026-06-18T12:00:05.200Z",
            "severity": "critical",
            "message": "DC bus voltage low",
        }
    }
    from app.schemas.tag_frame import TagFrame

    state.update_tag(
        TagFrame(
            tag_id="PV_101_I",
            asset_id="PV-101",
            value=1.2,
            unit="A",
            quality="GOOD",
            timestamp=TS,
            source="simulator",
        )
    )
    situations = evaluate_situations(state, list(state.active_alarms.values()), graph_index)
    assert len(situations) == 1
    assert situations[0]["situation_type"] == "PV_GENERATION_LOSS"
    assert situations[0]["root_asset_id"] == "PV-101"


def test_stale_only_data_yields_no_situation(graph_index):
    state = RuntimeState()
    from app.schemas.tag_frame import TagFrame

    state.update_tag(
        TagFrame(
            tag_id="MOTOR_301_CURRENT",
            asset_id="MTR-301",
            value=3.4,
            unit="A",
            quality="STALE",
            timestamp=TS,
            source="simulator",
        )
    )
    situations = evaluate_situations(state, [], graph_index)
    assert situations == []


def test_evaluate_node_fingerprint_penalizes_stale_tags(graph_index):
    state = RuntimeState()
    state.update_tag(
        TagFrame(
            tag_id="MOTOR_301_CURRENT",
            asset_id="MTR-301",
            value=None,
            unit="A",
            quality="STALE",
            timestamp=TS,
            source="simulator",
        )
    )
    score, reasons = evaluate_node_fingerprint("MTR-301", graph_index, state.tags, {})
    assert score < 0.5
    assert any("degraded" in reason for reason in reasons)