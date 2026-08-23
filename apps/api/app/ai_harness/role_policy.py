"""Role-based permission matrix for AI harness intents."""

from __future__ import annotations

from app.ai_harness.intents import Intent

# Which intents each role may use
_ROLE_PERMISSIONS: dict[str, frozenset[Intent]] = {
    "operator": frozenset(
        {
            Intent.EXPLAIN_SITUATION,
            Intent.EXPLAIN_ROOT_CAUSE,
            Intent.EXPLAIN_REJECTED_CANDIDATE,
            Intent.EXPLAIN_ALARM_FLOOD,
            Intent.RECOMMEND_FIRST_CHECK,
            Intent.EXPLAIN_TIME_TO_CONSEQUENCE,
        }
    ),
    "maintenance": frozenset(
        {
            Intent.EXPLAIN_SITUATION,
            Intent.EXPLAIN_ROOT_CAUSE,
            Intent.EXPLAIN_REJECTED_CANDIDATE,
            Intent.EXPLAIN_ALARM_FLOOD,
            Intent.RECOMMEND_FIRST_CHECK,
            Intent.EXPLAIN_TIME_TO_CONSEQUENCE,
            Intent.DRAFT_SCENARIO,
            Intent.DRAFT_ACTION_ENVELOPE,
        }
    ),
    "engineer": frozenset(
        {
            Intent.EXPLAIN_SITUATION,
            Intent.EXPLAIN_ROOT_CAUSE,
            Intent.EXPLAIN_REJECTED_CANDIDATE,
            Intent.EXPLAIN_ALARM_FLOOD,
            Intent.RECOMMEND_FIRST_CHECK,
            Intent.EXPLAIN_TIME_TO_CONSEQUENCE,
            Intent.DRAFT_GRAPH_CHANGE,
            Intent.DRAFT_SIGNAL_TEMPLATE,
            Intent.DRAFT_SCENARIO,
            Intent.DRAFT_ACTION_ENVELOPE,
            Intent.COMPARE_MODEL_DIFF,
        }
    ),
    "admin": frozenset(Intent),  # all intents
    "supervisor": frozenset(
        {
            Intent.EXPLAIN_SITUATION,
            Intent.EXPLAIN_ALARM_FLOOD,
            Intent.EXPLAIN_TIME_TO_CONSEQUENCE,
        }
    ),
    "viewer": frozenset(
        {
            Intent.EXPLAIN_SITUATION,
            Intent.EXPLAIN_ALARM_FLOOD,
        }
    ),
    "agent": frozenset(),  # agents cannot use this path
}

_ROLE_REFUSAL_MESSAGES: dict[str, str] = {
    "operator": "Operators can view and interpret plant status. Configuration drafting requires engineer access.",
    "maintenance": "Maintenance can draft scenarios and action steps. Graph model changes require engineer access.",
    "supervisor": "Supervisors can view situation summaries. Detailed configuration access requires engineer role.",
    "viewer": "Viewers can observe status. Detailed diagnosis access requires operator or higher role.",
    "agent": "Agents cannot use the AI harness conversation path.",
}


def is_intent_allowed(role: str, intent: Intent) -> bool:
    """Return True if the given role may use the given intent."""
    return intent in _ROLE_PERMISSIONS.get(role, frozenset())


def get_allowed_intents(role: str) -> frozenset[Intent]:
    return _ROLE_PERMISSIONS.get(role, frozenset())


def get_refusal_message(role: str, intent: Intent) -> str:
    base = _ROLE_REFUSAL_MESSAGES.get(role, "Insufficient role for this action.")
    return f"Role '{role}' cannot perform intent '{intent}'. {base}"
