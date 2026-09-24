"""Causal engine v2: loops, multi-root, first-out timing, contradictions, calibration."""

from __future__ import annotations

import asyncio
import copy
import json
from pathlib import Path

import pytest

from app.runtime.causal.structure import build_structure
from app.runtime.config_loader import _build_graph_index, load_runtime_config
from app.runtime.dag_runtime import diagnose_flood, diagnose_trace
from app.runtime.graph_compile import validate_and_compile_graph
from app.runtime.runtime_state import RuntimeState
from app.runtime.simulator.scenario_runner import ScenarioRunner
from app.runtime.simulator.simulator_gateway import SimulatorGateway
from app.runtime.situation_engine import evaluate_situations
from app.runtime.websocket_hub import WebSocketHub

REPO_ROOT = Path(__file__).resolve().parents[3]
DEMO_DIR = REPO_ROOT / "packages" / "sample-data" / "demo-microgrid"


def _alarm(alarm_id: str, asset: str, onset: str, comparator: str | None = ">") -> dict:
    return {
        "alarm_id": alarm_id,
        "asset_id": asset,
        "tag_id": f"{alarm_id}_TAG",
        "raised_at": onset,
        "onset_at": onset,
        "severity": "warning",
        "message": alarm_id,
        "evidence": {"comparator": comparator},
    }


def _edge(eid: str, a: str, b: str, lag=(0, 2000), **extra) -> dict:
    return {
        "id": eid,
        "from": a,
        "to": b,
        "edge_type": "cause_to_effect",
        "approved": True,
        "lag_ms": list(lag),
        "provenance": "engineer_entered",
        **extra,
    }


def _graph(nodes: list[str], edges: list[dict], **top) -> dict:
    return {
        "version": "1.0.0",
        "graph_id": "test_graph",
        "nodes": [{"id": n, "kind": "asset", "evidence_tags": []} for n in nodes],
        "edges": edges,
        **top,
    }


def _state(alarms: list[dict]) -> RuntimeState:
    state = RuntimeState()
    state.active_alarms = {a["alarm_id"]: a for a in alarms}
    return state


# --- Hero scenario end-to-end ------------------------------------------------------------


def _replay(scenario_id: str) -> RuntimeState:
    runner = ScenarioRunner(
        scenarios_path=DEMO_DIR / "scenarios.json", tag_map_path=DEMO_DIR / "tag_map.json"
    )
    gateway = SimulatorGateway(state=RuntimeState(), hub=WebSocketHub(), runner=runner)
    asyncio.run(gateway.start(scenario_id, realtime=False))
    return gateway._state


def test_hero_root_uses_approved_edges_and_explains_whole_flood():
    state = _replay("scn_motor_overload")
    situation = next(iter(state.active_situations.values()))
    assert situation["root_asset_id"] == "MTR-301"
    assert situation["confidence"] == "high"
    # v1 traversed zero edges; v2 explains bus/inverter alarms through the approved path.
    assert "E5" in situation["traversed_edges"]
    assert situation["unexplained_alarm_ids"] == []
    breakdown = situation["score_breakdown"]
    assert breakdown["timing"] == 1.0
    assert breakdown["coverage"] == 1.0
    assert breakdown["contradictions"] == 0
    assert breakdown["competitor"] == "BUS-101"
    assert breakdown["margin"] >= 0.5


def test_pv_loss_is_medium_confidence_because_root_is_unobserved():
    state = _replay("scn_pv_generation_loss")
    situation = next(iter(state.active_situations.values()))
    assert situation["root_asset_id"] == "PV-101"
    # No PV alarm exists; the root is inferred from fingerprint + topology → not "high".
    assert situation["confidence"] == "medium"


def test_trace_id_is_deterministic():
    config = load_runtime_config("demo", sample_data_dir=DEMO_DIR)
    alarms = [
        _alarm("MOTOR_CURRENT_HIGH", "MTR-301", "2026-06-18T12:00:02Z"),
        _alarm("DC_BUS_LOW", "BUS-101", "2026-06-18T12:00:04Z", "<"),
    ]
    first = diagnose_flood(config.graph_index, _state(alarms))
    second = diagnose_flood(config.graph_index, _state(copy.deepcopy(alarms)))
    assert first.trace_id == second.trace_id
    assert first.trace_id.startswith("TRACE_")


# --- Timing, polarity, windows -----------------------------------------------------------


def test_effect_before_cause_is_a_contradiction():
    gi = _build_graph_index(_graph(["A", "B"], [_edge("E1", "A", "B")]))
    state = _state(
        [
            _alarm("B_LOW", "B", "2026-01-01T00:00:00Z"),
            _alarm("A_HIGH", "A", "2026-01-01T00:00:05Z"),
        ]
    )
    trace = diagnose_flood(gi, state)
    a_score = next(s for s in trace.scores if s.node_id == "A")
    assert "B_LOW" in a_score.contradicting
    assert a_score.contradictions == 1
    assert trace.selected_root == "B"


def test_arrival_outside_accumulated_window_is_unexplained():
    gi = _build_graph_index(
        _graph(["A", "B", "C"], [_edge("E1", "A", "B", (0, 500)), _edge("E2", "B", "C", (0, 500))])
    )
    state = _state(
        [
            _alarm("A1", "A", "2026-01-01T00:00:00Z"),
            _alarm("C1", "C", "2026-01-01T00:00:05Z"),  # 5 s > 1 s window
        ]
    )
    trace = diagnose_flood(gi, state)
    a_score = next(s for s in trace.scores if s.node_id == "A")
    assert "C1" in a_score.unexplained
    # C then needs its own root: two independent explanations.
    assert {h.node_id for h in trace.roots} == {"A", "C"}


def test_polarity_mismatch_contradicts():
    gi = _build_graph_index(_graph(["A", "B"], [_edge("E1", "A", "B", polarity="-")]))
    # A rises; '-' edge predicts B falls, but B's alarm is a HIGH (rise) alarm.
    state = _state(
        [
            _alarm("A_HIGH", "A", "2026-01-01T00:00:00Z", ">"),
            _alarm("B_HIGH", "B", "2026-01-01T00:00:01Z", ">"),
        ]
    )
    trace = diagnose_flood(gi, state)
    a_score = next(s for s in trace.scores if s.node_id == "A")
    assert "B_HIGH" in a_score.contradicting


def test_polarity_match_explains():
    gi = _build_graph_index(_graph(["A", "B"], [_edge("E1", "A", "B", polarity="-")]))
    state = _state(
        [
            _alarm("A_HIGH", "A", "2026-01-01T00:00:00Z", ">"),
            _alarm("B_LOW", "B", "2026-01-01T00:00:01Z", "<"),
        ]
    )
    trace = diagnose_flood(gi, state)
    assert trace.selected_root == "A"
    a_score = next(s for s in trace.scores if s.node_id == "A")
    assert set(a_score.explained) == {"A_HIGH", "B_LOW"}
    assert a_score.contradictions == 0
    # No authored fingerprint evidence on these nodes → fingerprint floored at 0.5 → "medium".
    assert trace.confidence_bucket == "medium"


# --- Multi-root and ambiguity ------------------------------------------------------------


def test_two_independent_faults_yield_two_roots():
    gi = _build_graph_index(
        _graph(["X", "Y", "P", "Q"], [_edge("E1", "X", "Y"), _edge("E2", "P", "Q")])
    )
    state = _state(
        [
            _alarm("X1", "X", "2026-01-01T00:00:00Z"),
            _alarm("Y1", "Y", "2026-01-01T00:00:01Z"),
            _alarm("P1", "P", "2026-01-01T00:00:00.500Z"),
            _alarm("Q1", "Q", "2026-01-01T00:00:01.500Z"),
        ]
    )
    trace = diagnose_flood(gi, state)
    assert {h.node_id for h in trace.roots} == {"X", "P"}
    explained = set().union(*(set(h.explained) for h in trace.roots))
    assert explained == {"X1", "Y1", "P1", "Q1"}


def test_situations_are_emitted_per_independent_root():
    graph = _graph(
        ["X", "Y", "P", "Q"],
        [_edge("E1", "X", "Y"), _edge("E2", "P", "Q")],
        situation_types=[
            {"id": "SIT_X", "root_asset_id": "X", "required_alarms": ["X1", "Y1"]},
            {"id": "SIT_P", "root_asset_id": "P", "required_alarms": ["P1", "Q1"]},
        ],
    )
    gi = _build_graph_index(graph)
    alarms = [
        _alarm("X1", "X", "2026-01-01T00:00:00Z"),
        _alarm("Y1", "Y", "2026-01-01T00:00:01Z"),
        _alarm("P1", "P", "2026-01-01T00:00:00.500Z"),
        _alarm("Q1", "Q", "2026-01-01T00:00:01.500Z"),
    ]
    situations, trace = evaluate_situations(RuntimeState(), alarms, gi)
    assert {s["situation_type"] for s in situations} == {"SIT_X", "SIT_P"}
    # Each situation groups only the alarms its root explains.
    by_type = {s["situation_type"]: s for s in situations}
    assert set(by_type["SIT_X"]["grouped_alarm_ids"]) == {"X1", "Y1"}
    assert trace is not None and trace.selected_root == situations[0]["root_asset_id"]


def test_ambiguous_explanations_are_not_high_confidence():
    # Two upstream nodes both explain B equally → margin 0 → calibrated down.
    gi = _build_graph_index(
        _graph(["A1", "A2", "B"], [_edge("E1", "A1", "B"), _edge("E2", "A2", "B")])
    )
    state = _state(
        [
            _alarm("A1_H", "A1", "2026-01-01T00:00:00Z"),
            _alarm("A2_H", "A2", "2026-01-01T00:00:00Z"),
            _alarm("B_H", "B", "2026-01-01T00:00:01Z"),
        ]
    )
    trace = diagnose_trace("B_H", gi, state)
    assert trace.confidence_bucket != "high"


# --- Engineer-flagged feedback loops -----------------------------------------------------


def _loop_graph(flag_all: bool) -> dict:
    return _graph(
        ["HEAT", "RES", "LOAD"],
        [
            _edge("L1", "HEAT", "RES", (0, 1000), loop_ok=True, loop_id="thermal_runaway"),
            _edge("L2", "RES", "HEAT", (0, 1000), loop_ok=flag_all, loop_id="thermal_runaway"),
            _edge("E3", "RES", "LOAD", (0, 1000)),
        ],
    )


def _plant_for(graph: dict) -> tuple[dict, dict, dict]:
    plant = {"assets": [{"id": n["id"]} for n in graph["nodes"]]}
    return plant, {"tags": []}, {"rules": []}


def test_unflagged_cycle_is_rejected_at_compile():
    graph = _loop_graph(flag_all=False)
    plant, tag_map, rules = _plant_for(graph)
    result = validate_and_compile_graph(plant=plant, tag_map=tag_map, alarm_rules=rules, causal_graph=graph)
    assert not result.ok
    assert any("Cycle" in e.message and "L2" in e.message for e in result.errors)


def test_flagged_feedback_loop_compiles_and_is_reported():
    graph = _loop_graph(flag_all=True)
    plant, tag_map, rules = _plant_for(graph)
    result = validate_and_compile_graph(plant=plant, tag_map=tag_map, alarm_rules=rules, causal_graph=graph)
    assert result.ok, result.errors
    assert result.feedback_loops == [
        {"members": ["HEAT", "RES"], "edge_ids": ["L1", "L2"], "loop_ids": ["thermal_runaway"]}
    ]


def test_loop_is_condensed_and_windows_stay_finite():
    structure = build_structure(_build_graph_index(_loop_graph(flag_all=True)))
    assert structure.loop_members("HEAT") == ("HEAT", "RES")
    reach = structure.reach_from("HEAT")
    assert reach["RES"].via_loop
    # One pass through the loop dwell (1000 + 1000) plus the exit edge max (1000).
    assert reach["LOAD"].max_ms == 3000
    assert reach["LOAD"].min_ms == 0


def test_root_inside_loop_gets_loop_explanation():
    gi = _build_graph_index(_loop_graph(flag_all=True))
    state = _state(
        [
            _alarm("HEAT_HIGH", "HEAT", "2026-01-01T00:00:00Z"),
            _alarm("RES_HIGH", "RES", "2026-01-01T00:00:00.400Z"),
            _alarm("LOAD_HIGH", "LOAD", "2026-01-01T00:00:01Z"),
        ]
    )
    trace = diagnose_flood(gi, state)
    assert trace.selected_root == "HEAT"
    top = next(s for s in trace.scores if s.node_id == "HEAT")
    assert top.loop_note is not None and "loop entered at HEAT" in top.loop_note
    assert set(top.explained) == {"HEAT_HIGH", "RES_HIGH", "LOAD_HIGH"}


def test_demo_bundle_still_compiles():
    load = lambda name: json.loads((DEMO_DIR / name).read_text(encoding="utf-8"))  # noqa: E731
    result = validate_and_compile_graph(
        plant=load("plant.json"),
        tag_map=load("tag_map.json"),
        alarm_rules=load("alarm_rules.json"),
        causal_graph=load("causal_graph.json"),
    )
    assert result.ok
    assert result.feedback_loops == []


@pytest.mark.parametrize("scenario_id", ["scn_downstream_only_no_root", "scn_temporal_violation_rejected"])
def test_fail_closed_scenarios_still_produce_no_situation(scenario_id: str):
    state = _replay(scenario_id)
    assert not state.active_situations
