"""Unit tests for studio/graph_patch.py — validation, application, candidate generation."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.studio.graph_patch import (
    ALLOWED_EDGE_TYPES,
    PatchValidationResult,
    apply_graph_patch,
    generate_graph_draft_candidates,
    validate_graph_patch,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
DEMO_DIR = REPO_ROOT / "packages" / "sample-data" / "demo-microgrid"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def demo_bundle() -> dict:
    return {
        "plant": json.loads((DEMO_DIR / "plant.json").read_text(encoding="utf-8")),
        "tag_map": json.loads((DEMO_DIR / "tag_map.json").read_text(encoding="utf-8")),
        "alarm_rules": json.loads((DEMO_DIR / "alarm_rules.json").read_text(encoding="utf-8")),
        "causal_graph": json.loads((DEMO_DIR / "causal_graph.json").read_text(encoding="utf-8")),
        "scenarios": json.loads((DEMO_DIR / "scenarios.json").read_text(encoding="utf-8")),
        "action_envelope": {},
    }


def _valid_change(
    from_id: str = "MTR-301",
    to_id: str = "INV-102",
    edge_type: str = "cause_to_effect",
    edge_id: str = "E_AGENT_TESTXX",
    approved: bool = False,
    provenance: str = "agent_proposed",
    lag_ms: list | None = None,
    evidence_refs: list | None = None,
) -> dict:
    return {
        "change_type": "add_causal_edge",
        "target_path": "/causal_graph/edges",
        "patch": {
            "id": edge_id,
            "from": from_id,
            "to": to_id,
            "edge_type": edge_type,
            "approved": approved,
            "lag_ms": lag_ms or [0, 3000],
            "weight": 0.6,
            "confidence": 0.6,
            "provenance": provenance,
        },
        "rationale": "Test rationale.",
        "evidence_refs": evidence_refs or ["MOTOR_CURRENT_HIGH"],
        "risk_level": "medium",
    }


def _draft_payload(changes: list) -> dict:
    return {"proposed_changes": changes}


# ---------------------------------------------------------------------------
# validate_graph_patch — invalid cases
# ---------------------------------------------------------------------------


def test_validate_unknown_from_node_rejected(demo_bundle):
    result = validate_graph_patch(
        demo_bundle,
        _draft_payload([_valid_change(from_id="GHOST-999")]),
    )
    assert not result.valid
    assert any(e.code == "UNKNOWN_FROM_NODE" for e in result.errors)


def test_validate_unknown_to_node_rejected(demo_bundle):
    result = validate_graph_patch(
        demo_bundle,
        _draft_payload([_valid_change(to_id="GHOST-999")]),
    )
    assert not result.valid
    assert any(e.code == "UNKNOWN_TO_NODE" for e in result.errors)


def test_validate_self_loop_rejected(demo_bundle):
    result = validate_graph_patch(
        demo_bundle,
        _draft_payload([_valid_change(from_id="MTR-301", to_id="MTR-301")]),
    )
    assert not result.valid
    assert any(e.code == "SELF_LOOP" for e in result.errors)


def test_validate_duplicate_edge_rejected(demo_bundle):
    # E5 already exists: MTR-301 → BUS-101, structural_load_effect
    result = validate_graph_patch(
        demo_bundle,
        _draft_payload(
            [_valid_change(from_id="MTR-301", to_id="BUS-101", edge_type="structural_load_effect")]
        ),
    )
    assert not result.valid
    assert any(e.code == "DUPLICATE_EDGE" for e in result.errors)


def test_validate_duplicate_edge_id_rejected(demo_bundle):
    result = validate_graph_patch(
        demo_bundle,
        _draft_payload([_valid_change(edge_id="E1")]),  # E1 already in demo graph
    )
    assert not result.valid
    assert any(e.code == "DUPLICATE_EDGE_ID" for e in result.errors)


def test_validate_approved_true_rejected(demo_bundle):
    result = validate_graph_patch(
        demo_bundle,
        _draft_payload([_valid_change(approved=True)]),
    )
    assert not result.valid
    assert any(e.code == "AGENT_EDGE_MUST_BE_UNAPPROVED" for e in result.errors)


def test_validate_bad_provenance_rejected(demo_bundle):
    result = validate_graph_patch(
        demo_bundle,
        _draft_payload([_valid_change(provenance="engineer_entered")]),
    )
    assert not result.valid
    assert any(e.code == "INVALID_PROVENANCE" for e in result.errors)


def test_validate_bad_edge_type_rejected(demo_bundle):
    result = validate_graph_patch(
        demo_bundle,
        _draft_payload([_valid_change(edge_type="totally_fake_type")]),
    )
    assert not result.valid
    assert any(e.code == "INVALID_EDGE_TYPE" for e in result.errors)


def test_validate_bad_lag_ms_list_rejected(demo_bundle):
    change = _valid_change()
    change["patch"]["lag_ms"] = [3000, 500]  # min > max
    result = validate_graph_patch(demo_bundle, _draft_payload([change]))
    assert not result.valid
    assert any(e.code == "INVALID_LAG_MS_RANGE" for e in result.errors)


def test_validate_negative_lag_ms_rejected(demo_bundle):
    change = _valid_change()
    change["patch"]["lag_ms"] = [-100, 500]
    result = validate_graph_patch(demo_bundle, _draft_payload([change]))
    assert not result.valid
    assert any(e.code == "INVALID_LAG_MS_RANGE" for e in result.errors)


def test_validate_missing_evidence_refs_rejected(demo_bundle):
    change = _valid_change()
    change["evidence_refs"] = []  # override the helper default — empty list is falsy
    result = validate_graph_patch(demo_bundle, _draft_payload([change]))
    assert not result.valid
    assert any(e.code == "MISSING_EVIDENCE_REFS" for e in result.errors)


def test_validate_would_create_cycle_rejected(demo_bundle):
    # The demo graph has approved edges: PV-101→MPPT-101→BAT-101→BUS-101→INV-102
    # Adding INV-102→PV-101 would create a cycle when approved
    result = validate_graph_patch(
        demo_bundle,
        _draft_payload(
            [_valid_change(from_id="INV-102", to_id="PV-101", edge_type="cause_to_effect")]
        ),
    )
    assert not result.valid
    assert any(e.code == "WOULD_CREATE_CYCLE" for e in result.errors)


def test_validate_unsupported_change_type_rejected(demo_bundle):
    result = validate_graph_patch(
        demo_bundle,
        {
            "proposed_changes": [
                {
                    "change_type": "delete_causal_edge",
                    "patch": {},
                    "evidence_refs": ["X"],
                }
            ]
        },
    )
    assert not result.valid
    assert any(e.code == "UNSUPPORTED_CHANGE_TYPE" for e in result.errors)


# ---------------------------------------------------------------------------
# validate_graph_patch — valid case
# ---------------------------------------------------------------------------


def test_validate_valid_change_accepted(demo_bundle):
    result = validate_graph_patch(
        demo_bundle,
        _draft_payload([_valid_change()]),
    )
    assert result.valid
    assert result.errors == []


def test_validate_empty_proposed_changes_accepted(demo_bundle):
    result = validate_graph_patch(demo_bundle, {"proposed_changes": []})
    assert result.valid


# ---------------------------------------------------------------------------
# apply_graph_patch
# ---------------------------------------------------------------------------


def test_apply_patch_adds_edge_to_bundle(demo_bundle):
    change = _valid_change()
    new_bundle = apply_graph_patch(demo_bundle, _draft_payload([change]))
    edge_ids = [e["id"] for e in new_bundle["causal_graph"]["edges"]]
    assert "E_AGENT_TESTXX" in edge_ids


def test_apply_patch_edge_is_unapproved(demo_bundle):
    change = _valid_change()
    new_bundle = apply_graph_patch(demo_bundle, _draft_payload([change]))
    added = next(e for e in new_bundle["causal_graph"]["edges"] if e["id"] == "E_AGENT_TESTXX")
    assert added["approved"] is False
    assert added["provenance"] == "agent_proposed"


def test_apply_patch_does_not_modify_original(demo_bundle):
    original_count = len(demo_bundle["causal_graph"]["edges"])
    change = _valid_change()
    apply_graph_patch(demo_bundle, _draft_payload([change]))
    assert len(demo_bundle["causal_graph"]["edges"]) == original_count


def test_apply_multiple_patches(demo_bundle):
    changes = [
        _valid_change(from_id="MTR-301", to_id="INV-102", edge_id="E_AGENT_AA0001"),
        _valid_change(from_id="PV-101", to_id="INV-102", edge_id="E_AGENT_BB0002",
                      edge_type="cause_to_effect"),
    ]
    new_bundle = apply_graph_patch(demo_bundle, _draft_payload(changes))
    ids = [e["id"] for e in new_bundle["causal_graph"]["edges"]]
    assert "E_AGENT_AA0001" in ids
    assert "E_AGENT_BB0002" in ids


# ---------------------------------------------------------------------------
# generate_graph_draft_candidates
# ---------------------------------------------------------------------------


@pytest.fixture
def motor_overload_evidence() -> dict:
    return {
        "evidence_id": "EV_TEST_001",
        "root_asset_id": "MTR-301",
        "confidence": 0.85,
        "evidence_chain": [
            {
                "order": 1,
                "asset_id": "MTR-301",
                "alarm_id": "MOTOR_CURRENT_HIGH",
                "role": "first_signal",
                "first_seen_ts": "2026-01-01T10:00:00Z",
                "quality": "good",
                "explanation": "Motor current above limit.",
            },
            {
                "order": 2,
                "asset_id": "BUS-101",
                "alarm_id": "DC_BUS_LOW",
                "role": "downstream_effect",
                "first_seen_ts": "2026-01-01T10:00:01Z",
                "quality": "good",
                "explanation": "DC bus voltage dropped.",
            },
            {
                "order": 3,
                "asset_id": "INV-102",
                "alarm_id": "INVERTER_UNDERVOLTAGE",
                "role": "downstream_effect",
                "first_seen_ts": "2026-01-01T10:00:02Z",
                "quality": "good",
                "explanation": "Inverter undervoltage.",
            },
        ],
        "causal_path": [
            {
                "from_asset_id": "MTR-301",
                "to_asset_id": "BUS-101",
                "edge_id": "E5",
                "approved": True,
                "relation_type": "structural_load_effect",
            }
        ],
    }


def test_generate_candidates_returns_at_least_one(motor_overload_evidence):
    node_ids = {"MTR-301", "BUS-101", "INV-102", "PV-101", "MPPT-101", "BAT-101"}
    # BUS-101→INV-102 already exists with structural_load_effect (E6) - use different type
    edge_pairs: set[tuple[str, str, str]] = set()
    candidates = generate_graph_draft_candidates(
        motor_overload_evidence, node_ids, edge_pairs
    )
    assert len(candidates) >= 1


def test_generate_candidates_all_approved_false(motor_overload_evidence):
    node_ids = {"MTR-301", "BUS-101", "INV-102"}
    edge_pairs: set[tuple[str, str, str]] = set()
    candidates = generate_graph_draft_candidates(
        motor_overload_evidence, node_ids, edge_pairs
    )
    for c in candidates:
        assert c["patch"]["approved"] is False, "Agent proposals must always be unapproved"


def test_generate_candidates_provenance_agent_proposed(motor_overload_evidence):
    node_ids = {"MTR-301", "BUS-101", "INV-102"}
    edge_pairs: set[tuple[str, str, str]] = set()
    candidates = generate_graph_draft_candidates(
        motor_overload_evidence, node_ids, edge_pairs
    )
    for c in candidates:
        assert c["patch"]["provenance"] == "agent_proposed"


def test_generate_candidates_confidence_capped(motor_overload_evidence):
    node_ids = {"MTR-301", "BUS-101", "INV-102"}
    edge_pairs: set[tuple[str, str, str]] = set()
    candidates = generate_graph_draft_candidates(
        motor_overload_evidence, node_ids, edge_pairs
    )
    for c in candidates:
        assert c["patch"]["confidence"] <= 0.75, "Agent confidence must not exceed 0.75"


def test_generate_candidates_skips_traversed_path(motor_overload_evidence):
    node_ids = {"MTR-301", "BUS-101", "INV-102"}
    edge_pairs: set[tuple[str, str, str]] = set()
    candidates = generate_graph_draft_candidates(
        motor_overload_evidence, node_ids, edge_pairs
    )
    # MTR-301→BUS-101 is already in causal_path, should not be proposed
    proposed_pairs = [(c["patch"]["from"], c["patch"]["to"]) for c in candidates]
    assert ("MTR-301", "BUS-101") not in proposed_pairs


def test_generate_candidates_skips_unknown_assets(motor_overload_evidence):
    # Only MTR-301 is known — downstream assets are not in node_ids
    node_ids = {"MTR-301"}
    edge_pairs: set[tuple[str, str, str]] = set()
    candidates = generate_graph_draft_candidates(
        motor_overload_evidence, node_ids, edge_pairs
    )
    assert candidates == []


def test_generate_candidates_skips_existing_edge_type(motor_overload_evidence):
    node_ids = {"MTR-301", "BUS-101", "INV-102"}
    # Mark BUS-101→INV-102 as already existing with mechanical type
    edge_pairs = {("MTR-301", "INV-102", "mechanical")}
    candidates = generate_graph_draft_candidates(
        motor_overload_evidence, node_ids, edge_pairs
    )
    # MTR-301→INV-102 with mechanical type should be skipped
    mechanical_to_inv = [
        c for c in candidates
        if c["patch"]["from"] == "MTR-301"
        and c["patch"]["to"] == "INV-102"
        and c["patch"]["edge_type"] == "mechanical"
    ]
    assert mechanical_to_inv == []


def test_generate_candidates_has_evidence_refs(motor_overload_evidence):
    node_ids = {"MTR-301", "BUS-101", "INV-102"}
    edge_pairs: set[tuple[str, str, str]] = set()
    candidates = generate_graph_draft_candidates(
        motor_overload_evidence, node_ids, edge_pairs
    )
    for c in candidates:
        assert len(c["evidence_refs"]) >= 1


def test_generate_candidates_empty_when_no_downstream():
    evidence = {
        "evidence_id": "EV_EMPTY",
        "confidence": 0.5,
        "evidence_chain": [
            {
                "order": 1,
                "asset_id": "MTR-301",
                "alarm_id": "MOTOR_CURRENT_HIGH",
                "role": "first_signal",
                "first_seen_ts": "2026-01-01T10:00:00Z",
                "quality": "good",
                "explanation": "Motor current high.",
            }
        ],
        "causal_path": [],
    }
    candidates = generate_graph_draft_candidates(evidence, {"MTR-301"}, set())
    assert candidates == []


def test_generate_candidates_empty_when_no_first_signal():
    evidence = {
        "evidence_id": "EV_EMPTY2",
        "confidence": 0.5,
        "evidence_chain": [
            {
                "order": 1,
                "asset_id": "BUS-101",
                "alarm_id": "DC_BUS_LOW",
                "role": "downstream_effect",
                "first_seen_ts": "2026-01-01T10:00:00Z",
                "quality": "good",
                "explanation": "Bus low.",
            }
        ],
        "causal_path": [],
    }
    candidates = generate_graph_draft_candidates(evidence, {"BUS-101"}, set())
    assert candidates == []


# ---------------------------------------------------------------------------
# causal_graph schema must reject rationale inside edge patch
# ---------------------------------------------------------------------------


def test_causal_graph_schema_rejects_rationale_in_patch():
    """The causal_graph edge schema has additionalProperties: false.
    An agent patch with rationale inside the edge object must fail schema validation.
    This guards against the prompt/schema drift bug.
    """
    import importlib.util
    import sys

    # Use jsonschema if available; otherwise skip
    jsonschema = pytest.importorskip("jsonschema")

    schema_path = REPO_ROOT / "packages" / "contracts" / "causal_graph.schema.json"
    schema = json.loads(schema_path.read_text(encoding="utf-8"))

    invalid_edge = {
        "id": "E_BAD",
        "from": "MTR-301",
        "to": "BUS-101",
        "edge_type": "cause_to_effect",
        "approved": False,
        "lag_ms": [0, 5000],
        "weight": 0.5,
        "confidence": 0.5,
        "provenance": "agent_proposed",
        "rationale": "This should not be here per additionalProperties: false",
    }

    edge_schema = schema["properties"]["edges"]["items"]
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(invalid_edge, edge_schema)
