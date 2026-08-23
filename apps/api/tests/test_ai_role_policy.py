"""Test role-based permission matrix for AI harness intents."""

from __future__ import annotations

from app.ai_harness.intents import Intent
from app.ai_harness.role_policy import (
    get_allowed_intents,
    get_refusal_message,
    is_intent_allowed,
)


def test_operator_can_explain_root_cause():
    assert is_intent_allowed("operator", Intent.EXPLAIN_ROOT_CAUSE)


def test_operator_can_recommend_first_check():
    assert is_intent_allowed("operator", Intent.RECOMMEND_FIRST_CHECK)


def test_operator_cannot_draft_graph_change():
    assert not is_intent_allowed("operator", Intent.DRAFT_GRAPH_CHANGE)


def test_operator_cannot_draft_signal_template():
    assert not is_intent_allowed("operator", Intent.DRAFT_SIGNAL_TEMPLATE)


def test_maintenance_can_draft_scenario():
    assert is_intent_allowed("maintenance", Intent.DRAFT_SCENARIO)


def test_maintenance_cannot_draft_graph_change():
    assert not is_intent_allowed("maintenance", Intent.DRAFT_GRAPH_CHANGE)


def test_engineer_can_draft_graph_change():
    assert is_intent_allowed("engineer", Intent.DRAFT_GRAPH_CHANGE)


def test_engineer_can_draft_signal_template():
    assert is_intent_allowed("engineer", Intent.DRAFT_SIGNAL_TEMPLATE)


def test_engineer_can_compare_model_diff():
    assert is_intent_allowed("engineer", Intent.COMPARE_MODEL_DIFF)


def test_supervisor_gets_summary_only():
    allowed = get_allowed_intents("supervisor")
    assert Intent.EXPLAIN_SITUATION in allowed
    assert Intent.DRAFT_GRAPH_CHANGE not in allowed
    assert Intent.EXPLAIN_ROOT_CAUSE not in allowed


def test_viewer_limited_to_basic():
    allowed = get_allowed_intents("viewer")
    assert Intent.EXPLAIN_SITUATION in allowed
    assert Intent.EXPLAIN_ROOT_CAUSE not in allowed
    assert Intent.RECOMMEND_FIRST_CHECK not in allowed


def test_agent_has_no_permissions():
    allowed = get_allowed_intents("agent")
    assert len(allowed) == 0


def test_admin_has_all_permissions():
    allowed = get_allowed_intents("admin")
    # Admin should allow at minimum all the defined intents
    for intent in Intent:
        assert intent in allowed


def test_refusal_message_contains_role():
    msg = get_refusal_message("operator", Intent.DRAFT_GRAPH_CHANGE)
    assert "operator" in msg.lower()
    assert "engineer" in msg.lower() or "configuration" in msg.lower()


def test_unknown_role_has_no_permissions():
    allowed = get_allowed_intents("unknown_role")
    assert len(allowed) == 0
