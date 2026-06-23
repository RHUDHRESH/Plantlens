from dataclasses import dataclass
from typing import Literal, Optional

from alarm_engine import get_active_alarms
from dag_engine import Situation
from model_loader import get_model


@dataclass
class ActionEvaluation:
    action_id: str
    label: str
    action_code: int
    allowed: bool
    reason: str
    risk_level: str
    requires_isolation: bool
    requires_operator_confirm: bool
    target_equipment_id: str


def _active_alarm_ids() -> set[str]:
    return {a.alarm_id for a in get_active_alarms()}


def evaluate_actions_for_situation(
    situation: Situation,
    role: str,
) -> list[ActionEvaluation]:
    """Evaluate action envelope against a situation and operator role."""
    model = get_model()
    actions = model.action_envelope.get('actions', [])
    active_ids = _active_alarm_ids()
    results: list[ActionEvaluation] = []

    for action in actions:
        root_ids = set(action.get('root_alarm_ids', []))
        matches = (
            situation.root_alarm_id in root_ids
            or any(a.alarm_id in root_ids for a in situation.alarms)
        )
        if not matches:
            continue

        allowed_roles = action.get('allowed_roles', [])
        if role not in allowed_roles:
            results.append(ActionEvaluation(
                action_id=action['id'],
                label=action['label'],
                action_code=action['action_code'],
                allowed=False,
                reason=f"Role '{role}' not permitted for this action.",
                risk_level=action.get('risk_level', 'medium'),
                requires_isolation=action.get('requires_isolation', False),
                requires_operator_confirm=action.get('requires_operator_confirm', False),
                target_equipment_id=action.get('target_equipment_id', ''),
            ))
            continue

        blocked_if = set(action.get('blocked_if', []))
        blocking = blocked_if & active_ids
        if blocking:
            results.append(ActionEvaluation(
                action_id=action['id'],
                label=action['label'],
                action_code=action['action_code'],
                allowed=False,
                reason=action.get(
                    'blocked_message',
                    f"Blocked by active alarms: {', '.join(sorted(blocking))}",
                ),
                risk_level=action.get('risk_level', 'medium'),
                requires_isolation=action.get('requires_isolation', False),
                requires_operator_confirm=action.get('requires_operator_confirm', False),
                target_equipment_id=action.get('target_equipment_id', ''),
            ))
            continue

        results.append(ActionEvaluation(
            action_id=action['id'],
            label=action['label'],
            action_code=action['action_code'],
            allowed=True,
            reason=action.get('safety_note', 'Advisory only — no automatic hardware control.'),
            risk_level=action.get('risk_level', 'medium'),
            requires_isolation=action.get('requires_isolation', False),
            requires_operator_confirm=action.get('requires_operator_confirm', False),
            target_equipment_id=action.get('target_equipment_id', ''),
        ))

    return results


def evaluate_action(
    action_id: str,
    situation: Situation,
    role: str,
) -> Optional[ActionEvaluation]:
    evaluations = evaluate_actions_for_situation(situation, role)
    return next((e for e in evaluations if e.action_id == action_id), None)