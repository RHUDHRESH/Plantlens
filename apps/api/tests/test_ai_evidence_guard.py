"""Test evidence guard validation rules."""

from __future__ import annotations

import pytest

from app.ai_harness.context_builder import build_context
from app.ai_harness.evidence_guard import GuardViolation, guard_ai_response
from app.ai_harness.intents import Intent
from app.ai_harness.response_schema import AIResponse, EvidenceRef


def _base_response(**kwargs) -> AIResponse:
    defaults = dict(
        response_id="AIR_TEST001",
        intent=str(Intent.EXPLAIN_ROOT_CAUSE),
        role="operator",
        summary="test",
        answer="Test answer.",
        evidence_refs=[],
        cited_signals=[],
        cited_alarms=[],
        cited_assets=[],
        cited_edges=[],
        cited_audit_ids=[],
        proposed_actions=[],
        limitations=[],
        confidence=0.5,
        requires_human_approval=False,
        created_at="2026-01-01T00:00:00Z",
    )
    defaults.update(kwargs)
    return AIResponse(**defaults)


def _empty_snapshot() -> dict:
    return {
        "tags": {},
        "active_alarms": [],
        "active_situations": [],
        "latest_calm_card": None,
        "latest_evidence_packet": None,
        "asset_status": {},
    }


def _snapshot_with_stale(stale_tags: list[str]) -> dict:
    ep = {
        "evidence_id": "EV_GUARD",
        "stale_or_bad_tags": stale_tags,
        "evidence_chain": [],
        "causal_path": [],
        "rejected_candidates": [],
        "root_asset_id": "MTR-301",
    }
    return {**_empty_snapshot(), "latest_evidence_packet": ep}


def test_hardware_write_in_answer_raises_guard_violation():
    response = _base_response(answer="You should write to plc output register 5.")
    ctx = build_context(role="operator", snapshot=_empty_snapshot())
    with pytest.raises(GuardViolation):
        guard_ai_response(response, ctx)


def test_trip_breaker_in_answer_raises_guard_violation():
    response = _base_response(answer="Trip breaker CB-1 to isolate the fault.")
    ctx = build_context(role="operator", snapshot=_empty_snapshot())
    with pytest.raises(GuardViolation):
        guard_ai_response(response, ctx)


def test_stale_tags_add_limitation():
    response = _base_response(answer="Root cause is motor.")
    ctx = build_context(role="operator", snapshot=_snapshot_with_stale(["MOTOR_301_CURRENT"]))
    result = guard_ai_response(response, ctx)
    assert any("stale" in lim.lower() or "bad quality" in lim.lower() for lim in result.limitations)


def test_stale_tags_lists_affected_tags():
    response = _base_response(answer="Root cause is motor.")
    ctx = build_context(role="operator", snapshot=_snapshot_with_stale(["MOTOR_301_CURRENT", "BAD_TAG_2"]))
    result = guard_ai_response(response, ctx)
    assert any("MOTOR_301_CURRENT" in lim for lim in result.limitations)


def test_unknown_cited_asset_adds_limitation():
    ctx = build_context(
        role="operator",
        snapshot=_empty_snapshot(),
        compiled_bundle={
            "plant_id": "test",
            "asset_index": {"MTR-301": {}},
            "alarm_index": {},
            "tag_index": {},
            "graph_index": {"approved_edges": []},
        },
    )
    response = _base_response(cited_assets=["GHOST-999"])
    result = guard_ai_response(response, ctx)
    assert any("GHOST-999" in lim for lim in result.limitations)


def test_no_evidence_adds_limitation():
    response = _base_response(answer="Root cause answer.")
    ctx = build_context(role="operator", snapshot=_empty_snapshot())
    result = guard_ai_response(response, ctx)
    assert any("evidence" in lim.lower() or "plant model" in lim.lower() for lim in result.limitations)


def test_proposed_actions_adds_authority_limitation():
    response = _base_response(
        answer="You should inspect the motor.",
        proposed_actions=[{"action_id": "INSPECT_MOTOR", "label": "Inspect motor"}],
    )
    ctx = build_context(role="operator", snapshot=_empty_snapshot())
    result = guard_ai_response(response, ctx)
    assert any("PlantLens" in lim for lim in result.limitations)


def test_clean_response_passes_guard():
    response = _base_response(
        answer="Root cause is MTR-301 based on evidence.",
        cited_assets=["MTR-301"],
        evidence_refs=[EvidenceRef(ref_type="evidence_packet", ref_id="EV_001", quote_or_value="")],
    )
    ctx = build_context(role="operator", snapshot=_empty_snapshot())
    result = guard_ai_response(response, ctx)
    # No GuardViolation raised
    assert result.response_id == "AIR_TEST001"
