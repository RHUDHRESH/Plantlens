"""Test AIContext building from runtime snapshot."""

from __future__ import annotations

from app.ai_harness.context_builder import build_context
from app.ai_harness.intents import Intent


def _make_snapshot(
    *,
    evidence: dict | None = None,
    calm_card: dict | None = None,
    alarms: list | None = None,
    situations: list | None = None,
    stale_tags: list | None = None,
) -> dict:
    ep = evidence or {}
    if stale_tags and ep:
        ep = {**ep, "stale_or_bad_tags": stale_tags}
    return {
        "tags": {},
        "active_alarms": alarms or [],
        "active_situations": situations or [],
        "latest_calm_card": calm_card,
        "latest_evidence_packet": ep or None,
        "asset_status": {},
    }


def _motor_overload_ep(stale: list | None = None) -> dict:
    return {
        "evidence_id": "EV_CTX_001",
        "root_asset_id": "MTR-301",
        "situation_type": "MOTOR_MECHANICAL_OVERLOAD",
        "confidence": 0.85,
        "ts": "2026-01-01T10:00:00Z",
        "stale_or_bad_tags": stale or [],
        "evidence_chain": [
            {"order": 1, "asset_id": "MTR-301", "alarm_id": "MOTOR_CURRENT_HIGH", "role": "first_signal", "first_seen_ts": "2026-01-01T10:00:00Z", "quality": "good", "explanation": ""},
        ],
        "causal_path": [
            {"from_asset_id": "MTR-301", "to_asset_id": "BUS-101", "edge_id": "E5", "approved": True, "relation_type": "structural_load_effect", "explanation": ""},
        ],
        "rejected_candidates": [
            {"asset_id": "BUS-101", "reason": "alarm appeared after motor", "score": 0.2, "missing_evidence": [], "contradicted_by": []},
        ],
        "deterministic_trace_id": "TRACE_001",
    }


def test_build_context_with_evidence():
    snapshot = _make_snapshot(evidence=_motor_overload_ep())
    ctx = build_context(role="operator", snapshot=snapshot)

    assert ctx.plant_id == "EV_CTX_001" or ctx.plant_id is not None
    assert ctx.role == "operator"
    assert ctx.latest_evidence_packet is not None
    assert ctx.latest_evidence_packet["evidence_id"] == "EV_CTX_001"


def test_build_context_includes_rejected_candidates():
    snapshot = _make_snapshot(evidence=_motor_overload_ep())
    ctx = build_context(role="engineer", snapshot=snapshot)

    assert len(ctx.rejected_candidates) == 1
    assert ctx.rejected_candidates[0]["asset_id"] == "BUS-101"


def test_build_context_includes_causal_path():
    snapshot = _make_snapshot(evidence=_motor_overload_ep())
    ctx = build_context(role="operator", snapshot=snapshot)

    assert len(ctx.causal_path) == 1
    assert ctx.causal_path[0]["edge_id"] == "E5"


def test_build_context_stale_tags_propagated():
    snapshot = _make_snapshot(evidence=_motor_overload_ep(stale=["MOTOR_301_CURRENT"]))
    ctx = build_context(role="operator", snapshot=snapshot)

    assert "MOTOR_301_CURRENT" in ctx.stale_or_bad_tags


def test_build_context_allowed_intents_operator():
    snapshot = _make_snapshot()
    ctx = build_context(role="operator", snapshot=snapshot)

    assert Intent.EXPLAIN_ROOT_CAUSE in ctx.allowed_intents
    assert Intent.DRAFT_GRAPH_CHANGE not in ctx.allowed_intents


def test_build_context_allowed_intents_engineer():
    snapshot = _make_snapshot()
    ctx = build_context(role="engineer", snapshot=snapshot)

    assert Intent.DRAFT_GRAPH_CHANGE in ctx.allowed_intents
    assert Intent.DRAFT_SIGNAL_TEMPLATE in ctx.allowed_intents
    assert Intent.COMPARE_MODEL_DIFF in ctx.allowed_intents


def test_build_context_no_evidence():
    snapshot = _make_snapshot()
    ctx = build_context(role="operator", snapshot=snapshot)

    assert ctx.latest_evidence_packet is None
    assert ctx.calm_card is None
    assert ctx.active_alarms == []


def test_build_context_with_compiled_bundle():
    snapshot = _make_snapshot()
    compiled = {
        "plant_id": "test_plant",
        "asset_index": {"MTR-301": {"id": "MTR-301"}, "BUS-101": {"id": "BUS-101"}},
        "alarm_index": {"MOTOR_CURRENT_HIGH": {}, "DC_BUS_LOW": {}},
        "tag_index": {"MOTOR_301_CURRENT": {}, "BUS_101_V": {}},
        "graph_index": {"approved_edges": [{"id": "E5", "from": "MTR-301", "to": "BUS-101", "approved": True, "provenance": "engineer_entered"}]},
    }
    ctx = build_context(role="engineer", snapshot=snapshot, compiled_bundle=compiled)

    assert ctx.plant_id == "test_plant"
    assert "MTR-301" in ctx.known_asset_ids
    assert "MOTOR_CURRENT_HIGH" in ctx.known_alarm_ids
    assert len(ctx.graph_edges) == 1
