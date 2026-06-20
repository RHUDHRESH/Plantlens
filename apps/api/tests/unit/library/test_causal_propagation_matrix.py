"""Causal propagation matrix tests."""

from __future__ import annotations

import copy

from app.library.catalog import load_sample_assembly, load_standard_component_library
from app.library.matrices import build_causal_propagation_matrix


def _demo():
    return load_standard_component_library(), load_sample_assembly("demo_motor_fan_blower_assembly.json")


def test_causal_propagation_uses_only_approved_connections():
    library, assembly = _demo()
    matrix = build_causal_propagation_matrix(library, assembly)
    assert matrix["unapproved_edges_excluded_count"] >= 1
    assert "dc_power_supply_1" in matrix["adjacency"]
    assert "relay_contactor_1" in matrix["adjacency"]["dc_power_supply_1"] or "fuse_protection_block_1" in matrix["adjacency"]["dc_power_supply_1"]


def test_unapproved_connection_excluded_from_causal_graph():
    library, assembly = _demo()
    matrix = build_causal_propagation_matrix(library, assembly)
    for targets in matrix["adjacency"].values():
        assert "plc_analog_input_module_1" not in targets


def test_monitoring_sensor_edge_not_physical_causality():
    library, assembly = _demo()
    matrix = build_causal_propagation_matrix(library, assembly)
    assert matrix["monitoring_edges_excluded_count"] > 0
    assert "current_sensor_1" not in matrix["adjacency"].get("dc_motor_12v_1", [])


def test_causal_cycle_is_rejected():
    library, assembly = _demo()
    cyclic = copy.deepcopy(assembly)
    cyclic["connections"].append({
        "connection_id": "CYCLE",
        "from_asset_id": "dc_motor_12v_1",
        "from_port_id": "shaft_out",
        "to_asset_id": "dc_power_supply_1",
        "to_port_id": "dc_out",
        "connection_kind": "power",
        "approved": True,
        "lag_min_ms": 0,
        "lag_max_ms": 10,
        "notes": "feedback",
    })
    matrix = build_causal_propagation_matrix(library, cyclic)
    assert any(e["code"] == "CAUSAL_CYCLE_DETECTED" for e in matrix["errors"])


def test_topological_order_is_deterministic():
    library, assembly = _demo()
    first = build_causal_propagation_matrix(library, assembly)["topological_order"]
    second = build_causal_propagation_matrix(library, assembly)["topological_order"]
    assert first == second