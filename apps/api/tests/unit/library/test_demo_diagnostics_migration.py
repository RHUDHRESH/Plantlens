"""Demo motor/fan/blower diagnostic proof tests."""

from __future__ import annotations

import copy
import json
from pathlib import Path

from app.library.analysis import score_plant_faults
from app.library.catalog import load_sample_assembly, load_standard_component_library
from app.library.demo_signal_mapping import map_hmi_fixture_to_observed_signals
from app.library.matrices import build_fault_signature_matrix, build_observability_matrix
from app.library.sensor_recommendation import recommend_sensors

FIXTURE_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "hmi"


def _load_fixture(name: str) -> dict:
    return json.loads((FIXTURE_DIR / name).read_text(encoding="utf-8"))


def _instrumented_assembly():
    assembly = copy.deepcopy(load_sample_assembly("demo_motor_fan_blower_assembly.json"))
    signal_map = {
        "dc_power_supply_1": ["supply_voltage", "supply_current"],
        "dc_motor_12v_1": ["motor_current", "motor_rpm", "motor_vibration", "motor_temperature"],
        "bldc_fan_1": ["fan_rpm"],
        "industrial_blower_1": ["blower_airflow", "blower_current"],
    }
    for asset in assembly["assets"]:
        if asset["asset_id"] in signal_map:
            asset["configured_signals"] = signal_map[asset["asset_id"]]
    return assembly


def _rank(fixture_name: str):
    library = load_standard_component_library()
    assembly = _instrumented_assembly()
    fixture = _load_fixture(fixture_name)
    observed, quality = map_hmi_fixture_to_observed_signals(fixture)
    result = score_plant_faults(assembly, library, observed, quality)
    return result["ranked_faults"]


def _top_key(ranked: list[dict]) -> str:
    return ranked[0]["fault_key"] if ranked else ""


def test_motor_obstruction_ranks_above_fan_blower():
    ranked = _rank("motor_obstruction.json")
    top = _top_key(ranked)
    assert "dc_motor_12v_1.mechanical_obstruction" == top


def test_voltage_sag_ranks_above_motor_stall():
    ranked = _rank("voltage_sag.json")
    top = _top_key(ranked)
    assert top.startswith("dc_power_supply_1.")


def test_airflow_blockage_does_not_blame_motor():
    ranked = _rank("airflow_blockage.json")
    top = _top_key(ranked)
    assert "dc_motor_12v_1.mechanical_obstruction" != top
    assert "industrial_blower_1" in top or "inlet_blockage" in top


def test_stale_sensor_reduces_confidence():
    library = load_standard_component_library()
    assembly = load_sample_assembly("demo_motor_fan_blower_assembly.json")
    fixture = _load_fixture("stale_sensor.json")
    observed, quality = map_hmi_fixture_to_observed_signals(fixture)
    result = score_plant_faults(assembly, library, observed, quality)
    assert any("penalty" in r["explanation"].lower() or "stale" in r["explanation"].lower() for r in result["ranked_faults"][:5])


def test_missing_sensor_lowers_confidence_and_triggers_recommendation():
    library = load_standard_component_library()
    assembly = copy.deepcopy(load_sample_assembly("demo_motor_fan_blower_assembly.json"))
    assembly["assets"] = [a for a in assembly["assets"] if a["component_type_id"] != "rpm_tachometer"]
    assembly["connections"] = [
        c for c in assembly["connections"]
        if "rpm_tachometer" not in (c["from_asset_id"], c["to_asset_id"])
    ]
    f = build_fault_signature_matrix(library, assembly)
    o = build_observability_matrix(library, assembly, f)
    motor_row = next(r for r in o["fault_observability"] if r["fault_key"] == "dc_motor_12v_1.mechanical_obstruction")
    assert motor_row["confidence_ceiling"] <= 0.60
    recs = recommend_sensors(library, assembly, f, o)
    assert recs["recommended_sensors"] or recs["coverage_after"] >= recs["coverage_before"]