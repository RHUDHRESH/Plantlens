"""Unit tests for plant assembly validation."""

from __future__ import annotations

import copy

from app.library.assembly import validate_plant_assembly
from app.library.catalog import load_sample_assembly, load_standard_component_library


def test_demo_motor_fan_blower_assembly_validates():
    library = load_standard_component_library()
    assembly = load_sample_assembly("demo_motor_fan_blower_assembly.json")
    result = validate_plant_assembly(assembly, library)
    assert result["status"] == "ok"
    assert not result["errors"]


def test_invalid_bad_connection_assembly_fails():
    library = load_standard_component_library()
    assembly = load_sample_assembly("invalid_bad_connection_assembly.json")
    result = validate_plant_assembly(assembly, library)
    assert result["status"] == "error"
    codes = {err["code"] for err in result["errors"]}
    assert "INCOMPATIBLE_PORTS" in codes


def test_duplicate_asset_id_fails():
    library = load_standard_component_library()
    assembly = load_sample_assembly("demo_motor_fan_blower_assembly.json")
    dup = copy.deepcopy(assembly)
    dup["assets"].append(copy.deepcopy(dup["assets"][0]))
    result = validate_plant_assembly(dup, library)
    assert result["status"] == "error"
    assert any(err["code"] == "DUPLICATE_ASSET_ID" for err in result["errors"])


def test_unknown_component_type_id_fails():
    library = load_standard_component_library()
    assembly = load_sample_assembly("demo_motor_fan_blower_assembly.json")
    bad = copy.deepcopy(assembly)
    bad["assets"][0]["component_type_id"] = "not_real_component"
    result = validate_plant_assembly(bad, library)
    assert result["status"] == "error"
    assert any(err["code"] == "UNKNOWN_COMPONENT_TYPE" for err in result["errors"])


def test_unknown_port_id_fails():
    library = load_standard_component_library()
    assembly = load_sample_assembly("demo_motor_fan_blower_assembly.json")
    bad = copy.deepcopy(assembly)
    bad["connections"][0]["from_port_id"] = "bogus_port"
    result = validate_plant_assembly(bad, library)
    assert result["status"] == "error"
    assert any(err["code"] == "UNKNOWN_PORT_ID" for err in result["errors"])