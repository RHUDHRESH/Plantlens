"""Deterministic alarm evaluation against live tags."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.runtime.runtime_state import RuntimeState
from app.schemas.alarm import AlarmRule


@dataclass
class AlarmEngineState:
    condition_true_since: dict[str, datetime] = field(default_factory=dict)
    cleared_pending: dict[str, datetime] = field(default_factory=dict)
    acked: set[str] = field(default_factory=set)
    shelved_until: dict[str, datetime] = field(default_factory=dict)


_alarm_engine_state = AlarmEngineState()


def get_alarm_engine_state() -> AlarmEngineState:
    return _alarm_engine_state


def reset_alarm_engine_state() -> None:
    global _alarm_engine_state
    _alarm_engine_state = AlarmEngineState()


def _compare(op: str, value: Any, threshold: float) -> bool:
    if value is None:
        return False
    if op == ">":
        return float(value) > threshold
    if op == ">=":
        return float(value) >= threshold
    if op == "<":
        return float(value) < threshold
    if op == "<=":
        return float(value) <= threshold
    if op == "==":
        return value == threshold
    if op == "!=":
        return value != threshold
    if op == "bool_true":
        return value is True
    if op == "bool_false":
        return value is False
    return False


def _evaluate_condition(rule: AlarmRule, value: Any, *, currently_active: bool) -> tuple[bool, str]:
    cond = rule.condition
    if cond.op == "bool_true":
        active = value is True
        return active, rule.severity

    if cond.warning is not None and cond.critical is not None and cond.op == "<":
        if value is None:
            return False, rule.severity
        numeric = float(value)
        if numeric < float(cond.critical):
            return True, "critical"
        if numeric < float(cond.warning):
            return True, "warning"
        if currently_active and rule.deadband > 0:
            clear_level = float(cond.warning) + rule.deadband
            if numeric < clear_level:
                return True, "warning"
        return False, rule.severity

    threshold = cond.threshold
    if threshold is None:
        return False, rule.severity

    active = _compare(cond.op, value, float(threshold))
    if currently_active and rule.deadband > 0 and not active:
        if cond.op in {">", ">="}:
            active = float(value) > float(threshold) - rule.deadband
        elif cond.op in {"<", "<="}:
            active = float(value) < float(threshold) + rule.deadband
    return active, rule.severity


def evaluate_alarms(
    state: RuntimeState,
    rules: list[AlarmRule],
    now: datetime,
    *,
    engine_state: AlarmEngineState | None = None,
) -> list[dict[str, Any]]:
    """Evaluate all rules; non-GOOD quality tags do not raise process alarms."""
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    local_state = engine_state or _alarm_engine_state
    active_records: list[dict[str, Any]] = []

    for rule in rules:
        if rule.id in local_state.shelved_until and now < local_state.shelved_until[rule.id]:
            continue

        tag = state.get_tag(rule.tag)
        was_active = rule.id in state.active_alarms

        if tag is None or tag.quality != "GOOD":
            local_state.condition_true_since.pop(rule.id, None)
            if was_active and rule.latching and rule.id not in local_state.acked:
                active_records.append(state.active_alarms[rule.id])
            continue

        breached, severity = _evaluate_condition(rule, tag.value, currently_active=was_active)
        delay_ms = rule.delay_ms + rule.condition.for_ms

        if breached:
            first_true = local_state.condition_true_since.get(rule.id)
            if first_true is None:
                local_state.condition_true_since[rule.id] = now
                first_true = now
            elapsed_ms = (now - first_true).total_seconds() * 1000
            if elapsed_ms < delay_ms:
                if was_active and (rule.latching or rule.requires_ack):
                    active_records.append(state.active_alarms[rule.id])
                continue

            record = {
                "alarm_id": rule.id,
                "asset_id": rule.asset_id or tag.asset_id,
                "tag_id": rule.tag,
                "severity": severity,
                "message": rule.message,
                "raised_at": tag.timestamp.isoformat().replace("+00:00", "Z"),
                "value": tag.value,
                "acked": rule.id in local_state.acked,
                "priority": rule.priority,
            }
            active_records.append(record)
        else:
            local_state.condition_true_since.pop(rule.id, None)
            if was_active and rule.latching and rule.id not in local_state.acked:
                active_records.append(state.active_alarms[rule.id])
            elif was_active and rule.requires_ack and rule.id not in local_state.acked:
                active_records.append(state.active_alarms[rule.id])

    return active_records


def acknowledge_alarm(
    state: RuntimeState,
    alarm_id: str,
    *,
    engine_state: AlarmEngineState | None = None,
) -> None:
    local_state = engine_state or _alarm_engine_state
    local_state.acked.add(alarm_id)
    if alarm_id in state.active_alarms:
        state.active_alarms[alarm_id]["acked"] = True