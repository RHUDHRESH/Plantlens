"""Unit tests for compatibility matrix builder."""

from __future__ import annotations

from app.library.catalog import load_standard_component_library
from app.library.matrices import build_compatibility_matrix, lookup_template_edge


def test_compatibility_matrix_is_deterministic_across_two_builds():
    library = load_standard_component_library()
    first = build_compatibility_matrix(library)
    second = build_compatibility_matrix(library)
    assert first["compatible_edges"] == second["compatible_edges"]
    assert first["rejected_edges"] == second["rejected_edges"]


def test_matrix_contains_expected_valid_edge():
    library = load_standard_component_library()
    matrix = build_compatibility_matrix(library)
    edge = lookup_template_edge(library, "dc_power_supply", "dc_out", "dc_motor_12v", "power_in")
    assert edge is not None
    assert edge["compatible"] is True
    assert any(
        e["from_component_type_id"] == "dc_power_supply"
        and e["to_component_type_id"] == "dc_motor_12v"
        for e in matrix["compatible_edges"]
    )


def test_matrix_contains_expected_rejected_edge():
    library = load_standard_component_library()
    matrix = build_compatibility_matrix(library)
    edge = lookup_template_edge(library, "voltage_sensor", "signal_out", "air_duct", "air_in")
    assert edge is not None
    assert edge["compatible"] is False
    assert any(
        e["from_component_type_id"] == "voltage_sensor"
        and e["to_component_type_id"] == "air_duct"
        for e in matrix["rejected_edges"]
    )