"""Observability matrix tests."""

from __future__ import annotations

import copy

from app.library.catalog import load_sample_assembly, load_standard_component_library
from app.library.matrices import build_fault_signature_matrix, build_observability_matrix


def _demo():
    library = load_standard_component_library()
    assembly = load_sample_assembly("demo_motor_fan_blower_assembly.json")
    return library, assembly


def _matrices(library, assembly):
    f = build_fault_signature_matrix(library, assembly)
    o = build_observability_matrix(library, assembly, f)
    return f, o


def test_fully_instrumented_fault_is_observable():
    library, assembly = _demo()
    instrumented = copy.deepcopy(assembly)
    for asset in instrumented["assets"]:
        if asset["asset_id"] == "dc_motor_12v_1":
            asset["configured_signals"] = ["motor_current", "motor_rpm", "motor_vibration", "motor_temperature"]
    _, o = _matrices(library, instrumented)
    row = next(r for r in o["fault_observability"] if r["fault_key"] == "dc_motor_12v_1.mechanical_obstruction")
    assert row["observability_class"] == "observable"
    assert row["confidence_ceiling"] >= 0.8


def test_missing_required_signal_caps_confidence_below_060():
    library, assembly = _demo()
    stripped = copy.deepcopy(assembly)
    stripped["assets"] = [a for a in stripped["assets"] if a["component_type_id"] != "rpm_tachometer"]
    stripped["connections"] = [
        c for c in stripped["connections"]
        if "rpm_tachometer" not in (c["from_asset_id"], c["to_asset_id"])
    ]
    _, o = _matrices(library, stripped)
    row = next(r for r in o["fault_observability"] if r["fault_key"] == "dc_motor_12v_1.mechanical_obstruction")
    assert row["confidence_ceiling"] <= 0.60


def test_optional_only_evidence_cannot_produce_high_confidence():
    library, assembly = _demo()
    f = build_fault_signature_matrix(library, assembly)
    optional_only = next(
        f_fault for f_fault in f["faults"]
        if not f_fault["required_evidence"] and f_fault["optional_evidence"]
    )
    o = build_observability_matrix(library, assembly, f)
    row = next(r for r in o["fault_observability"] if r["fault_key"] == optional_only["fault_key"])
    assert row["confidence_ceiling"] <= 0.45


def test_unobservable_fault_marked_unobservable():
    library, assembly = _demo()
    bare = copy.deepcopy(assembly)
    for asset in bare["assets"]:
        asset["configured_signals"] = []
    bare["connections"] = [c for c in bare["connections"] if c["connection_kind"] == "power" and c["approved"]]
    f = build_fault_signature_matrix(library, bare)
    no_evidence_fault = next(
        fault for fault in f["faults"]
        if not fault["required_evidence"] and not fault["optional_evidence"] and not fault["downstream_effects"]
    )
    o = build_observability_matrix(library, bare, f)
    row = next(r for r in o["fault_observability"] if r["fault_key"] == no_evidence_fault["fault_key"])
    assert row["observability_class"] == "unobservable"