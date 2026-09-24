"""Causal pattern library: loading, role binding, neighbours, instantiation, coverage API."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.changes.ops import apply_change_set
from app.changes.validation import validate_bundle
from app.library.instantiate import (
    PatternInstantiationError,
    bind_roles,
    instantiate_pattern,
    resolve_neighbours,
)
from app.library.patterns import get_pattern, library_for_pattern, load_libraries
from app.runtime.config_loader import read_bundle_files

REPO_ROOT = Path(__file__).resolve().parents[3]
DEMO_DIR = REPO_ROOT / "packages" / "sample-data" / "demo-microgrid"


@pytest.fixture
def bundle() -> dict:
    return read_bundle_files(DEMO_DIR)


def _parts(bundle: dict) -> dict:
    return {k: bundle[k] for k in ("plant", "tag_map", "causal_graph", "alarm_rules")}


def test_libraries_load_with_unique_prefixed_ids():
    libraries = load_libraries()
    assert "induction_motor" in libraries
    seen: set[str] = set()
    for component_type, library in libraries.items():
        for pattern in library["patterns"]:
            assert pattern["pattern_id"].startswith(f"{component_type}.")
            assert pattern["pattern_id"] not in seen
            seen.add(pattern["pattern_id"])


def test_induction_motor_library_is_comprehensive():
    motor = load_libraries()["induction_motor"]
    modes = {p["failure_mode"] for p in motor["patterns"]}
    for expected in (
        "mechanical_overload", "locked_rotor_stall", "single_phasing", "voltage_unbalance",
        "stator_interturn_short", "insulation_ground_fault", "broken_rotor_bars",
        "air_gap_eccentricity", "bearing_defect", "lubrication_failure", "shaft_misalignment",
        "rotor_unbalance", "cooling_failure", "thermal_runaway", "vfd_bearing_current_fluting",
    ):
        assert expected in modes
    assert len(motor["patterns"]) >= 20
    loops = [p for p in motor["patterns"] if p.get("mechanism", {}).get("loops")]
    assert len(loops) >= 4


def test_neighbours_look_through_drive_to_supply(bundle):
    rels = resolve_neighbours(bundle["plant"], "MTR-301")
    assert rels["driver"] == ["INV-102"]
    assert rels["upstream_supply"] == ["BUS-101"]


def test_ambiguous_tags_are_reported_not_guessed():
    role_defs = {"vibration": {"role": "vibration", "units": ["mm/s"], "signal_type_prefixes": ["mechanical.vibration"]}}
    tags = [
        {"tag": "VIB_X", "unit": "mm/s", "signal_type": "mechanical.vibration"},
        {"tag": "VIB_Y", "unit": "mm/s", "signal_type": "mechanical.vibration"},
    ]
    binding = bind_roles(["vibration"], role_defs, tags)["vibration"]
    assert binding.tag_id is None
    assert binding.method == "ambiguous"
    assert binding.candidates == ["VIB_X", "VIB_Y"]


def test_explicit_binding_must_belong_to_asset(bundle):
    pattern = get_pattern("induction_motor.mechanical_overload")
    with pytest.raises(PatternInstantiationError):
        instantiate_pattern(
            pattern, library_for_pattern(pattern["pattern_id"]), asset_id="MTR-301",
            bindings={"current": "BAT_101_I"}, **_parts(bundle),
        )


def test_missing_required_role_is_an_observability_gap(bundle):
    pattern = get_pattern("induction_motor.bearing_defect")
    result = instantiate_pattern(pattern, library_for_pattern(pattern["pattern_id"]), asset_id="MTR-301", **_parts(bundle))
    assert result.ok is False
    assert result.change_set is None
    assert result.missing_required == ["bearing_envelope"]


def test_every_observable_motor_pattern_yields_a_valid_draft(bundle):
    library = load_libraries()["induction_motor"]
    produced = 0
    for pattern in library["patterns"]:
        result = instantiate_pattern(pattern, library, asset_id="MTR-301", **_parts(bundle))
        if not result.ok:
            continue
        produced += 1
        change_set = result.change_set
        assert change_set is not None and change_set.source == "pattern_library"
        drafted = apply_change_set(bundle, change_set)
        assert all(
            e["approved"] is False for e in drafted["causal_graph"]["edges"] if e.get("provenance") == "pattern_library"
        )
        validation = validate_bundle(apply_change_set(bundle, change_set, approve_edges=True))
        assert validation["ok"], (pattern["pattern_id"], validation)
    assert produced >= 5


def test_existing_relation_is_not_duplicated(bundle):
    pattern = get_pattern("induction_motor.mechanical_overload")
    result = instantiate_pattern(pattern, library_for_pattern(pattern["pattern_id"]), asset_id="MTR-301", **_parts(bundle))
    edges = [op.edge for op in result.change_set.ops if op.op == "add_edge"]
    assert all(not (e["from"] == "MTR-301" and e["to"] == "BUS-101") for e in edges)
    assert any("already modelled by edge E5" in note for note in result.notes)


def test_every_library_file_validates_against_schema():
    from jsonschema import Draft202012Validator

    schema = json.loads((REPO_ROOT / "packages/contracts/causal_pattern_library.schema.json").read_text())
    validator = Draft202012Validator(schema)
    for path in sorted((REPO_ROOT / "packages/sample-data/component-library/causal_patterns").glob("*.json")):
        errors = list(validator.iter_errors(json.loads(path.read_text())))
        assert not errors, (path.name, errors[0].message)


def _auth(client: TestClient, role: str) -> dict[str, str]:
    token = client.post("/internal/auth-test/dev-token", json={"role": role, "subject": f"{role}-1"}).json()[
        "access_token"
    ]
    return {"Authorization": f"Bearer {token}"}


def test_coverage_endpoint_reports_observability(client: TestClient):
    response = client.get("/api/library/patterns/coverage/MTR-301", headers=_auth(client, "viewer"))
    assert response.status_code == 200
    body = response.json()
    by_id = {p["pattern_id"]: p for p in body["patterns"]}
    assert by_id["induction_motor.mechanical_overload"]["observable"] is True
    assert by_id["induction_motor.bearing_defect"]["observable"] is False
    assert 0 < body["observable"] < body["total"]


def test_instantiate_requires_engineer(client: TestClient):
    response = client.post(
        "/api/library/patterns/induction_motor.mechanical_overload/instantiate",
        json={"asset_id": "MTR-301"},
        headers=_auth(client, "operator"),
    )
    assert response.status_code == 403


def test_pattern_listing_and_detail(client: TestClient):
    listing = client.get("/api/library/patterns", headers=_auth(client, "viewer")).json()
    assert listing["pattern_count"] >= 22
    detail = client.get(
        "/api/library/patterns/induction_motor.broken_rotor_bars", headers=_auth(client, "viewer")
    ).json()
    assert detail["pattern"]["signatures"]
    assert any(r["role"] == "current" for r in detail["roles"])


def _loop_pattern(loop_ok: bool) -> tuple[dict, dict]:
    library = {"roles": [{"role": "voltage", "quantity": "v", "units": ["V"], "signal_type_prefixes": ["electrical.voltage"]}]}
    rule = {"relation": "upstream_supply", "effect_role": "current", "direction": "rise", "polarity": "+",
            "lag_ms": [0, 500], "edge_type": "structural_load_effect"}
    if loop_ok:
        rule.update(loop_ok=True, loop_id="source_impedance")
    pattern = {"pattern_id": "dc_bus.test_loop", "version": "1.0.0", "failure_mode": "test_loop", "title": "Test",
               "severity": "warning", "required_roles": ["voltage"], "trigger_role": "voltage",
               "symptoms": [{"role": "voltage", "direction": "fall", "onset_lag_ms": [0, 0], "weight": 1.0}],
               "propagation": [rule]}
    return pattern, library


def test_unflagged_back_edge_is_skipped_with_explanation(bundle):
    pattern, library = _loop_pattern(loop_ok=False)
    result = instantiate_pattern(
        pattern, library, asset_id="BUS-101", bindings={"voltage": "BUS_101_V"}, **_parts(bundle)
    )
    assert not [op for op in result.change_set.ops if op.op == "add_edge"]
    assert any("unflagged cycle with E3" in n for n in result.notes)


def test_flagged_loop_proposes_whole_cycle_as_loop_ok(bundle):
    pattern, library = _loop_pattern(loop_ok=True)
    result = instantiate_pattern(
        pattern, library, asset_id="BUS-101", bindings={"voltage": "BUS_101_V"}, **_parts(bundle)
    )
    ops = result.change_set.ops
    added = [op.edge for op in ops if op.op == "add_edge"]
    assert added and added[0]["loop_ok"] is True and added[0]["to"] == "BAT-101"
    updates = {op.edge_id: op.fields for op in ops if op.op == "update_edge"}
    assert updates == {"E3": {"loop_ok": True, "loop_id": "source_impedance"}}
    validation = validate_bundle(apply_change_set(bundle, result.change_set, approve_edges=True))
    assert validation["ok"], validation
    assert validation["feedback_loops"][0]["members"] == ["BAT-101", "BUS-101"]
