"""Fault scoring tests."""

from __future__ import annotations

from app.library.catalog import load_sample_assembly, load_standard_component_library
from app.library.matrices import build_fault_signature_matrix, build_observability_matrix
from app.library.scoring import rank_fault_candidates, score_fault_candidate


def _context():
    library = load_standard_component_library()
    assembly = load_sample_assembly("demo_motor_fan_blower_assembly.json")
    f = build_fault_signature_matrix(library, assembly)
    o = build_observability_matrix(library, assembly, f)
    return f, o


def test_fault_scoring_matches_required_evidence():
    f, o = _context()
    fault = next(x for x in f["faults"] if x["fault_key"] == "dc_motor_12v_1.mechanical_obstruction")
    row = next(r for r in o["fault_observability"] if r["fault_key"] == fault["fault_key"])
    observed = {
        "dc_motor_12v_1.motor_current": {"value": 5.0, "relation": "high", "quality": "good", "timestamp_status": "fresh"},
        "dc_motor_12v_1.motor_rpm": {"value": 100, "relation": "low", "quality": "good", "timestamp_status": "fresh"},
    }
    scored = score_fault_candidate(fault, observed, {}, row)
    assert scored["final_score"] > 0.5
    assert "dc_motor_12v_1.motor_current" in scored["matched_required_evidence"]


def test_fault_scoring_penalizes_stale_signal():
    f, o = _context()
    fault = next(x for x in f["faults"] if x["fault_key"] == "dc_motor_12v_1.mechanical_obstruction")
    row = next(r for r in o["fault_observability"] if r["fault_key"] == fault["fault_key"])
    fresh = {
        "dc_motor_12v_1.motor_current": {"value": 5.0, "relation": "high", "quality": "good", "timestamp_status": "fresh"},
        "dc_motor_12v_1.motor_rpm": {"value": 100, "relation": "low", "quality": "good", "timestamp_status": "fresh"},
    }
    stale = {
        **fresh,
        "dc_motor_12v_1.motor_rpm": {"value": 100, "relation": "stale", "quality": "good", "timestamp_status": "stale"},
    }
    fresh_score = score_fault_candidate(fault, fresh, {}, row)["final_score"]
    stale_score = score_fault_candidate(fault, stale, {"dc_motor_12v_1.motor_rpm": {"timestamp_status": "stale"}}, row)["final_score"]
    assert stale_score < fresh_score


def test_fault_scoring_penalizes_conflicting_evidence():
    f, o = _context()
    fault = next(x for x in f["faults"] if x["fault_key"] == "dc_motor_12v_1.mechanical_obstruction")
    row = next(r for r in o["fault_observability"] if r["fault_key"] == fault["fault_key"])
    good = {
        "dc_motor_12v_1.motor_current": {"value": 5.0, "relation": "high", "quality": "good", "timestamp_status": "fresh"},
        "dc_motor_12v_1.motor_rpm": {"value": 100, "relation": "low", "quality": "good", "timestamp_status": "fresh"},
    }
    conflict = {
        "dc_motor_12v_1.motor_current": {"value": 0.2, "relation": "low", "quality": "good", "timestamp_status": "fresh"},
        "dc_motor_12v_1.motor_rpm": {"value": 100, "relation": "low", "quality": "good", "timestamp_status": "fresh"},
    }
    assert score_fault_candidate(fault, conflict, {}, row)["final_score"] < score_fault_candidate(fault, good, {}, row)["final_score"]


def test_observability_ceiling_caps_final_score():
    f, o = _context()
    fault = next(x for x in f["faults"] if x["fault_key"] == "dc_motor_12v_1.mechanical_obstruction")
    row = next(r for r in o["fault_observability"] if r["fault_key"] == fault["fault_key"])
    low_ceiling = {**row, "confidence_ceiling": 0.35}
    observed = {
        "dc_motor_12v_1.motor_current": {"value": 5.0, "relation": "high", "quality": "good", "timestamp_status": "fresh"},
        "dc_motor_12v_1.motor_rpm": {"value": 100, "relation": "low", "quality": "good", "timestamp_status": "fresh"},
    }
    scored = score_fault_candidate(fault, observed, {}, low_ceiling)
    assert scored["final_score"] <= 0.35