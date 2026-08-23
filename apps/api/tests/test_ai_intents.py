"""Test deterministic intent classification."""

from __future__ import annotations

import pytest

from app.ai_harness.intents import Intent, classify_intent


@pytest.mark.parametrize(
    "message,expected",
    [
        # Root cause
        ("Why is the motor the root cause?", Intent.EXPLAIN_ROOT_CAUSE),
        ("what caused the alarm flood?", Intent.EXPLAIN_ROOT_CAUSE),
        ("why is it the root?", Intent.EXPLAIN_ROOT_CAUSE),
        ("How was it determined?", Intent.EXPLAIN_ROOT_CAUSE),
        # Rejected candidate
        ("Why not the inverter?", Intent.EXPLAIN_REJECTED_CANDIDATE),
        ("why isn't the bus the root?", Intent.EXPLAIN_REJECTED_CANDIDATE),
        ("which candidates were rejected?", Intent.EXPLAIN_REJECTED_CANDIDATE),
        # Alarm flood
        ("how many alarms are grouped?", Intent.EXPLAIN_ALARM_FLOOD),
        ("show all alarms", Intent.EXPLAIN_ALARM_FLOOD),
        ("why so many alarms?", Intent.EXPLAIN_ALARM_FLOOD),
        # First check
        ("what should I check first?", Intent.RECOMMEND_FIRST_CHECK),
        ("what action do I take?", Intent.RECOMMEND_FIRST_CHECK),
        ("recommend something", Intent.RECOMMEND_FIRST_CHECK),
        # Time to consequence
        ("how long until thermal limit?", Intent.EXPLAIN_TIME_TO_CONSEQUENCE),
        ("time to consequence?", Intent.EXPLAIN_TIME_TO_CONSEQUENCE),
        ("when will the temperature reach the limit?", Intent.EXPLAIN_TIME_TO_CONSEQUENCE),
        # Situation
        ("what is happening?", Intent.EXPLAIN_SITUATION),
        ("explain situation", Intent.EXPLAIN_SITUATION),
        ("what's wrong?", Intent.EXPLAIN_SITUATION),
        # Graph change
        ("add edge from motor to bus", Intent.DRAFT_GRAPH_CHANGE),
        ("propose causal edge", Intent.DRAFT_GRAPH_CHANGE),
        ("change the graph model", Intent.DRAFT_GRAPH_CHANGE),
        # Signal template
        ("make a fan template", Intent.DRAFT_SIGNAL_TEMPLATE),
        ("signal template for motor", Intent.DRAFT_SIGNAL_TEMPLATE),
        ("suggest tags for blower", Intent.DRAFT_SIGNAL_TEMPLATE),
        # Scenario
        ("draft scenario for blower fault", Intent.DRAFT_SCENARIO),
        ("create a test scenario", Intent.DRAFT_SCENARIO),
        # Action envelope
        ("draft action envelope entry", Intent.DRAFT_ACTION_ENVELOPE),
        ("add maintenance procedure", Intent.DRAFT_ACTION_ENVELOPE),
        # Model diff
        ("show model diff", Intent.COMPARE_MODEL_DIFF),
        ("what changed in the bundle?", Intent.COMPARE_MODEL_DIFF),
        # Unsafe
        ("trip the breaker", Intent.UNKNOWN_UNSAFE),
        ("write to plc output", Intent.UNKNOWN_UNSAFE),
        ("force output on", Intent.UNKNOWN_UNSAFE),
        ("disable alarm for motor", Intent.UNKNOWN_UNSAFE),
        ("change threshold live", Intent.UNKNOWN_UNSAFE),
        ("ack alarm on motor", Intent.UNKNOWN_UNSAFE),
    ],
)
def test_intent_classification(message: str, expected: Intent):
    result = classify_intent(message)
    assert result == expected, f"'{message}' → {result}, expected {expected}"


def test_unknown_message_returns_situation():
    result = classify_intent("hello, how are you?")
    assert result == Intent.EXPLAIN_SITUATION


def test_classify_is_case_insensitive():
    assert classify_intent("WHY IS THE MOTOR THE ROOT CAUSE") == Intent.EXPLAIN_ROOT_CAUSE
    assert classify_intent("TRIP THE BREAKER") == Intent.UNKNOWN_UNSAFE
