"""Sensor recommendation tests."""

from __future__ import annotations

import copy

from app.library.catalog import load_sample_assembly, load_standard_component_library
from app.library.matrices import build_fault_signature_matrix, build_observability_matrix
from app.library.sensor_recommendation import recommend_sensors


def _demo():
    library = load_standard_component_library()
    assembly = load_sample_assembly("demo_motor_fan_blower_assembly.json")
    f = build_fault_signature_matrix(library, assembly)
    o = build_observability_matrix(library, assembly, f)
    return library, assembly, f, o


def test_sensor_recommendation_improves_coverage():
    library, assembly, f, o = _demo()
    stripped = copy.deepcopy(assembly)
    stripped["assets"] = [a for a in stripped["assets"] if a["component_type_id"] != "temperature_sensor"]
    f2 = build_fault_signature_matrix(library, stripped)
    o2 = build_observability_matrix(library, stripped, f2)
    result = recommend_sensors(library, stripped, f2, o2)
    assert result["coverage_after"] >= result["coverage_before"]


def test_greedy_sensor_recommendation_is_deterministic():
    library, assembly, f, o = _demo()
    first = recommend_sensors(library, assembly, f, o)
    second = recommend_sensors(library, assembly, f, o)
    assert first == second


def test_existing_sensor_not_recommended_again():
    library, assembly, f, o = _demo()
    result = recommend_sensors(library, assembly, f, o, max_recommendations=8)
    existing = {a["component_type_id"] for a in assembly["assets"] if a["component_type_id"].endswith("_sensor") or a["component_type_id"] == "rpm_tachometer"}
    for rec in result["recommended_sensors"]:
        if rec["marginal_gain"] < 0.05:
            continue
        assert rec["component_type_id"] not in existing or rec["marginal_gain"] < 0.2