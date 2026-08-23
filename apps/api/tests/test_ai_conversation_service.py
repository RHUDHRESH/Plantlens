"""Test deterministic answer builders in conversation_service."""

from __future__ import annotations

import asyncio
from typing import Any

from app.ai_harness.conversation_service import answer_message as answer_message_async
from app.ai_harness.intents import Intent


def answer_message(*args: Any, **kwargs: Any):
    return asyncio.run(answer_message_async(*args, **kwargs))


def _motor_ep() -> dict:
    return {
        "evidence_id": "EV_CONV_001",
        "plant_id": "demo",
        "root_asset_id": "MTR-301",
        "situation_type": "MOTOR_MECHANICAL_OVERLOAD",
        "situation_id": "SIT_001",
        "confidence": 0.85,
        "confidence_reason": "Motor current preceded bus sag via approved edge.",
        "ts": "2026-01-01T10:00:00Z",
        "runtime_bundle_version": "1.0.0",
        "source_frame_ids": [],
        "active_alarm_ids": ["MOTOR_CURRENT_HIGH", "DC_BUS_LOW"],
        "grouped_alarm_ids": ["MOTOR_CURRENT_HIGH", "MOTOR_SPEED_LOW", "DC_BUS_LOW", "INV_UNDERVOLTAGE"],
        "stale_or_bad_tags": [],
        "missing_tags": [],
        "blocked_actions": [],
        "recommended_checks": [],
        "deterministic_trace_id": "TRACE_CONV_001",
        "evidence_chain": [
            {
                "order": 1, "asset_id": "MTR-301", "alarm_id": "MOTOR_CURRENT_HIGH",
                "role": "first_signal", "first_seen_ts": "2026-01-01T10:00:00Z",
                "quality": "GOOD", "explanation": "Motor current exceeded limit."
            },
            {
                "order": 2, "asset_id": "BUS-101", "alarm_id": "DC_BUS_LOW",
                "role": "downstream_effect", "first_seen_ts": "2026-01-01T10:00:03Z",
                "quality": "GOOD", "explanation": "Bus sag after motor overload."
            },
        ],
        "causal_path": [
            {
                "from_asset_id": "MTR-301", "to_asset_id": "BUS-101",
                "edge_id": "E5", "approved": True,
                "relation_type": "structural_load_effect", "explanation": ""
            }
        ],
        "rejected_candidates": [
            {
                "asset_id": "BUS-101", "reason": "alarm appeared after motor",
                "score": 0.2, "missing_evidence": [], "contradicted_by": []
            }
        ],
    }


def _snapshot(ep: dict | None = None, calm: dict | None = None) -> dict:
    return {
        "tags": {},
        "active_alarms": {"MOTOR_CURRENT_HIGH": {"alarm_id": "MOTOR_CURRENT_HIGH", "raised_at": "2026-01-01T10:00:00Z"}},
        "active_situations": [{"situation_id": "SIT_001", "root_asset_id": "MTR-301", "situation_type": "MOTOR_MECHANICAL_OVERLOAD"}],
        "latest_calm_card": calm,
        "latest_evidence_packet": ep,
        "asset_status": {},
    }


def _motor_calm() -> dict:
    return {
        "root_asset_id": "MTR-301",
        "recommended_first_check": {
            "action_id": "INSPECT_SHAFT_LOAD",
            "label": "Inspect shaft load, coupling, and bearing drag",
            "risk_level": "medium",
            "requires_isolation": True,
        },
        "blocked_actions": [],
        "time_to_consequence": None,
        "why_it_matters": "Motor overload impacts bus voltage and downstream loads.",
    }


# ---------------------------------------------------------------------------
# Root cause explanation
# ---------------------------------------------------------------------------


def test_explain_root_cause_cites_evidence():
    response = answer_message(
        "why is the motor the root cause?",
        role="operator",
        snapshot=_snapshot(ep=_motor_ep()),
    )
    assert response.intent == str(Intent.EXPLAIN_ROOT_CAUSE)
    assert len(response.evidence_refs) >= 1
    assert "MTR-301" in response.answer


def test_explain_root_cause_mentions_first_signal():
    response = answer_message(
        "what caused the fault?",
        role="operator",
        snapshot=_snapshot(ep=_motor_ep()),
    )
    assert "MOTOR_CURRENT_HIGH" in response.answer


def test_explain_root_cause_mentions_downstream():
    response = answer_message(
        "why is it the root?",
        role="operator",
        snapshot=_snapshot(ep=_motor_ep()),
    )
    assert "downstream" in response.answer.lower() or "DC_BUS_LOW" in response.answer


def test_explain_root_cause_mentions_causal_path():
    response = answer_message(
        "what caused the fault?",
        role="operator",
        snapshot=_snapshot(ep=_motor_ep()),
    )
    assert "E5" in response.answer or "MTR-301" in response.answer


def test_explain_root_cause_has_response_id():
    response = answer_message(
        "why root cause?",
        role="operator",
        snapshot=_snapshot(ep=_motor_ep()),
    )
    assert response.response_id.startswith("AIR_")


# ---------------------------------------------------------------------------
# Rejected candidate
# ---------------------------------------------------------------------------


def test_explain_rejected_candidate_mentions_bus():
    response = answer_message(
        "why not BUS-101?",
        role="operator",
        snapshot=_snapshot(ep=_motor_ep()),
    )
    assert response.intent == str(Intent.EXPLAIN_REJECTED_CANDIDATE)
    assert "BUS-101" in response.answer
    assert "rejected" in response.answer.lower() or "reason" in response.answer.lower()


def test_explain_rejected_candidate_cites_evidence():
    response = answer_message(
        "why isn't BUS-101 the root?",
        role="operator",
        snapshot=_snapshot(ep=_motor_ep()),
    )
    assert len(response.evidence_refs) >= 1
    assert any(r.ref_type == "rejected_candidate" for r in response.evidence_refs)


# ---------------------------------------------------------------------------
# First check
# ---------------------------------------------------------------------------


def test_recommend_first_check_returns_action():
    response = answer_message(
        "what should I check first?",
        role="operator",
        snapshot=_snapshot(ep=_motor_ep(), calm=_motor_calm()),
    )
    assert response.intent == str(Intent.RECOMMEND_FIRST_CHECK)
    assert "shaft" in response.answer.lower() or "inspect" in response.answer.lower()


def test_recommend_first_check_includes_authority_disclaimer():
    response = answer_message(
        "what action should I take?",
        role="operator",
        snapshot=_snapshot(ep=_motor_ep(), calm=_motor_calm()),
    )
    assert "PlantLens" in response.answer or "does not control" in response.answer


# ---------------------------------------------------------------------------
# No evidence
# ---------------------------------------------------------------------------


def test_no_evidence_returns_insufficient():
    response = answer_message(
        "why is it the root cause?",
        role="operator",
        snapshot=_snapshot(ep=None),
    )
    assert len(response.limitations) >= 1
    assert any("evidence" in lim.lower() or "simulator" in lim.lower() for lim in response.limitations)


# ---------------------------------------------------------------------------
# Role gates
# ---------------------------------------------------------------------------


def test_operator_cannot_draft_graph_change():
    response = answer_message(
        "add edge from motor to bus",
        role="operator",
        snapshot=_snapshot(ep=_motor_ep()),
    )
    # Either refused or returned a safe redirect
    assert response.role == "operator"
    # Should be refused or redirected — check it's not a full graph mutation
    assert "not" in response.answer.lower() or "role" in response.answer.lower() or "engineer" in response.answer.lower() or "agent" in response.answer.lower()


def test_unknown_unsafe_is_refused():
    response = answer_message(
        "trip the breaker now",
        role="operator",
        snapshot=_snapshot(ep=_motor_ep()),
    )
    assert response.intent == str(Intent.UNKNOWN_UNSAFE)
    assert "does not" in response.answer.lower() or "cannot" in response.answer.lower()


def test_llm_disabled_uses_deterministic_fallback(monkeypatch):
    """When PLANTLENS_LLM_ENABLED is false, builders stay deterministic."""
    from app.settings import get_settings

    monkeypatch.setenv("PLANTLENS_LLM_ENABLED", "false")
    get_settings.cache_clear()
    try:
        response = answer_message(
            "what is the root cause?",
            role="operator",
            snapshot=_snapshot(ep=_motor_ep()),
            settings=get_settings(),
        )
        assert response.intent == str(Intent.EXPLAIN_ROOT_CAUSE)
        assert "MTR-301" in response.answer
        assert not any("llm_narration" in lim.lower() for lim in response.limitations)
    finally:
        get_settings.cache_clear()


def test_hardware_write_patterns_still_refused_with_llm_enabled(monkeypatch):
    """Hardware write intents refuse even when LLM is enabled."""
    from app.settings import get_settings

    monkeypatch.setenv("PLANTLENS_LLM_ENABLED", "true")
    monkeypatch.setenv("PLANTLENS_LLM_BASE_URL", "http://127.0.0.1:9")
    get_settings.cache_clear()
    try:
        response = answer_message(
            "write to plc output coil",
            role="engineer",
            snapshot=_snapshot(ep=_motor_ep()),
            settings=get_settings(),
        )
        assert response.intent == str(Intent.UNKNOWN_UNSAFE)
        assert "plc" in response.answer.lower() or "hardware" in response.answer.lower()
    finally:
        get_settings.cache_clear()


def test_engineer_gets_draft_signal_template():
    response = answer_message(
        "make a fan signal template",
        role="engineer",
        snapshot=_snapshot(),
    )
    assert response.intent == str(Intent.DRAFT_SIGNAL_TEMPLATE)
    assert response.draft_artifact is not None
    assert response.draft_artifact["artifact_type"] == "signal_template_draft"
    assert response.requires_human_approval is True
