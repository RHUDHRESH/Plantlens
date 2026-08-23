"""Deterministic intent classification — keyword/rule matching only, no LLM."""

from __future__ import annotations

import re
from enum import StrEnum


class Intent(StrEnum):
    EXPLAIN_SITUATION = "EXPLAIN_SITUATION"
    EXPLAIN_ROOT_CAUSE = "EXPLAIN_ROOT_CAUSE"
    EXPLAIN_REJECTED_CANDIDATE = "EXPLAIN_REJECTED_CANDIDATE"
    EXPLAIN_ALARM_FLOOD = "EXPLAIN_ALARM_FLOOD"
    RECOMMEND_FIRST_CHECK = "RECOMMEND_FIRST_CHECK"
    EXPLAIN_TIME_TO_CONSEQUENCE = "EXPLAIN_TIME_TO_CONSEQUENCE"
    DRAFT_GRAPH_CHANGE = "DRAFT_GRAPH_CHANGE"
    DRAFT_SIGNAL_TEMPLATE = "DRAFT_SIGNAL_TEMPLATE"
    DRAFT_SCENARIO = "DRAFT_SCENARIO"
    DRAFT_ACTION_ENVELOPE = "DRAFT_ACTION_ENVELOPE"
    COMPARE_MODEL_DIFF = "COMPARE_MODEL_DIFF"
    UNKNOWN_UNSAFE = "UNKNOWN_UNSAFE"


# ---------------------------------------------------------------------------
# Keyword rule sets (evaluated in order — first match wins)
# ---------------------------------------------------------------------------

_UNSAFE_PATTERNS = re.compile(
    r"\b(trip\s+(?:the\s+)?(?:breaker|relay|circuit)|"
    r"toggle\s+relay|write\s+to\s+(?:the\s+)?plc|"
    r"control\s+output|ack(?:knowledge)?\s+alarm|"
    r"reset\s+alarm|force\s+output|plc\s+write|override\s+interlock|"
    r"disable\s+alarm|clear\s+alarm|live\s+threshold|change\s+threshold\s+live|"
    r"arm\s+relay|reboot\s+plc|send\s+command)\b",
    re.IGNORECASE,
)

_RULES: list[tuple[re.Pattern, Intent]] = [
    # Rejected candidate — check before root-cause (more specific)
    (
        re.compile(
            r"\b(why\s+not|not\s+the\s+root|rejected|not\s+chosen|"
            r"why\s+isn.?t|why\s+not\s+\w+|alternate\s+cause|"
            r"other\s+candidate|dismiss)\b",
            re.IGNORECASE,
        ),
        Intent.EXPLAIN_REJECTED_CANDIDATE,
    ),
    # Root cause
    (
        re.compile(
            r"\b(why\s+(is\s+it|motor|pv|battery|bus|fan|blower|charger|"
            r"the\s+root)|root\s+cause|what\s+caused|how\s+(was\s+it|did\s+it)\s+"
            r"determin|why\s+root|which\s+asset|what\s+is\s+the\s+cause|"
            r"how\s+was\s+it\s+determined|determined\s+the\s+root)\b",
            re.IGNORECASE,
        ),
        Intent.EXPLAIN_ROOT_CAUSE,
    ),
    # Alarm flood  — use alarms? to match both singular and plural
    (
        re.compile(
            r"\b(alarm\s+flood|many\s+alarms?|all\s+alarms?|grouped\s+alarms?|"
            r"which\s+alarms?|how\s+many\s+alarms?|alarm\s+count|suppressed\s+alarms?|"
            r"show\s+all\s+alarms?|why\s+so\s+many)\b",
            re.IGNORECASE,
        ),
        Intent.EXPLAIN_ALARM_FLOOD,
    ),
    # First check / recommendation
    (
        re.compile(
            r"\b(what\s+should\s+i|first\s+check|what\s+do\s+i\s+do|what\s+action|"
            r"what\s+next|check\s+first|look\s+at\s+first|start\s+with|"
            r"recommend|suggest\s+action|operator\s+action)\b",
            re.IGNORECASE,
        ),
        Intent.RECOMMEND_FIRST_CHECK,
    ),
    # Time to consequence
    (
        re.compile(
            r"\b(time\s+to|how\s+long|when\s+will|consequence|estimate\s+time|"
            r"countdown|how\s+much\s+time|minutes?\s+left|time\s+limit)\b",
            re.IGNORECASE,
        ),
        Intent.EXPLAIN_TIME_TO_CONSEQUENCE,
    ),
    # Situation
    (
        re.compile(
            r"\b(what\s+is\s+happening|what\s+situation|explain\s+situation|"
            r"current\s+status|what.?s\s+wrong|what\s+happened|"
            r"describe\s+the\s+fault|active\s+situation)\b",
            re.IGNORECASE,
        ),
        Intent.EXPLAIN_SITUATION,
    ),
    # Graph change draft
    (
        re.compile(
            r"\b(add\s+edge|draft\s+edge|change\s+(the\s+)?graph|modify\s+graph|"
            r"propose\s+(causal\s+)?edge|new\s+causal|edit\s+model|"
            r"graph\s+change|update\s+graph|causal\s+link)\b",
            re.IGNORECASE,
        ),
        Intent.DRAFT_GRAPH_CHANGE,
    ),
    # Signal template
    (
        re.compile(
            r"\b((signal|tag|sensor)\s+template|template\s+for|"
            r"(fan|blower|motor|battery|dc.?bus|charger|inverter)\s+template|"
            r"suggest\s+(tags|signals)|make\s+a\s+(fan|blower|motor)\s+"
            r"(template|setup|config))\b",
            re.IGNORECASE,
        ),
        Intent.DRAFT_SIGNAL_TEMPLATE,
    ),
    # Scenario draft
    (
        re.compile(
            r"\b(draft\s+scenario|create\s+scenario|simulate|test\s+scenario|"
            r"regression\s+scenario|fault\s+scenario|what\s+if\s+scenario)\b",
            re.IGNORECASE,
        ),
        Intent.DRAFT_SCENARIO,
    ),
    # Action envelope draft
    (
        re.compile(
            r"\b(draft\s+action|add\s+action|new\s+action|action\s+envelope|"
            r"operator\s+procedure|maintenance\s+(step|procedure)|add\s+procedure)\b",
            re.IGNORECASE,
        ),
        Intent.DRAFT_ACTION_ENVELOPE,
    ),
    # Model diff
    (
        re.compile(
            r"\b(diff|compare\s+model|model\s+diff|what\s+changed|"
            r"show\s+changes|bundle\s+changes|compare\s+bundle|"
            r"graph\s+version)\b",
            re.IGNORECASE,
        ),
        Intent.COMPARE_MODEL_DIFF,
    ),
]


def classify_intent(message: str) -> Intent:
    """Deterministic intent classification — no LLM needed.

    Evaluates UNKNOWN_UNSAFE first, then specific rules in order.
    Returns EXPLAIN_SITUATION as a safe default for unmatched messages.
    """
    if _UNSAFE_PATTERNS.search(message):
        return Intent.UNKNOWN_UNSAFE

    for pattern, intent in _RULES:
        if pattern.search(message):
            return intent

    return Intent.EXPLAIN_SITUATION
