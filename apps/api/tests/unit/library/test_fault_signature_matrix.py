"""Fault signature matrix tests."""

from __future__ import annotations

import copy

from app.library.catalog import load_sample_assembly, load_standard_component_library
from app.library.matrices import build_fault_signature_matrix, get_fault_signature_for_asset


def _demo():
    return load_standard_component_library(), load_sample_assembly("demo_motor_fan_blower_assembly.json")


def test_fault_signature_matrix_builds_for_demo_assembly():
    library, assembly = _demo()
    matrix = build_fault_signature_matrix(library, assembly)
    assert matrix["assembly_id"] == "demo_assembly_001"
    assert len(matrix["faults"]) > 0


def test_every_enabled_fault_produces_stable_fault_key():
    library, assembly = _demo()
    matrix = build_fault_signature_matrix(library, assembly)
    keys = [f["fault_key"] for f in matrix["faults"]]
    assert len(keys) == len(set(keys))
    assert all("." in key for key in keys)


def test_required_evidence_appears_in_fault_signature():
    library, assembly = _demo()
    matrix = build_fault_signature_matrix(library, assembly)
    motor_fault = next(
        f for f in matrix["faults"]
        if f["fault_mode_id"] == "mechanical_obstruction" and f["asset_id"] == "dc_motor_12v_1"
    )
    signal_ids = {s["signal_template_id"] for s in motor_fault["signature"] if s["required"]}
    assert "motor_current" in signal_ids
    assert "motor_rpm" in signal_ids


def test_unknown_evidence_signal_produces_structured_warning():
    library, assembly = _demo()
    asset = next(a for a in assembly["assets"] if a["asset_id"] == "dc_motor_12v_1")
    component = next(c for c in library["components"] if c["component_type_id"] == "dc_motor_12v")
    mutated = copy.deepcopy(component)
    mutated["fault_modes"] = [{
        "fault_mode_id": "bad_evidence",
        "title": "Bad",
        "severity": "warning",
        "required_evidence": [{"signal_template_id": "nonexistent_signal", "relation": "high", "weight": 0.9, "required": True}],
        "optional_evidence": [],
        "operator_actions": [],
        "rejected_alternatives": [],
        "downstream_effects": [],
    }]
    faults, warnings = get_fault_signature_for_asset(
        {**asset, "enabled_fault_modes": ["bad_evidence"]},
        mutated,
    )
    assert faults
    assert any(w["code"] == "UNKNOWN_FAULT_SIGNAL_REFERENCE" for w in warnings)