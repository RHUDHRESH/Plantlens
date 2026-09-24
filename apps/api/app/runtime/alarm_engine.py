"""Deterministic alarm evaluation against live tags."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from app.runtime.runtime_state import RuntimeState
from app.schemas.alarm import AlarmRule


@dataclass
class AlarmEngineState:
    condition_true_since: dict[str, datetime] = field(default_factory=dict)
    cleared_pending: dict[str, datetime] = field(default_factory=dict)
    acked: set[str] = field(default_factory=set)
    shelved_until: dict[str, datetime] = field(default_factory=dict)
    # rule_id -> instant the running debounce completes; drives deadline catch-up and the ticker.
    pending_deadlines: dict[str, datetime] = field(default_factory=dict)
    # rule_id -> instant the alarm first latched; stable while it stays active (first-out order).
    raised_at: dict[str, datetime] = field(default_factory=dict)
    # rule_id -> instant the condition first became true (process onset, before debounce).
    onset_at: dict[str, datetime] = field(default_factory=dict)
    # rule_id -> {"reason", "by", "at"} for operator-visible shelving records (ISA-18.2).
    shelved_meta: dict[str, dict[str, str]] = field(default_factory=dict)


_alarm_engine_state = AlarmEngineState()


def get_alarm_engine_state() -> AlarmEngineState:
    return _alarm_engine_state


def reset_alarm_engine_state() -> None:
    global _alarm_engine_state
    _alarm_engine_state = AlarmEngineState()


def reconcile_alarm_engine_state(rule_ids: set[str]) -> None:
    """Drop per-rule state for rules removed by a deploy; keep the rest (acks, latches)."""
    local_state = _alarm_engine_state
    for mapping in (
        local_state.condition_true_since,
        local_state.cleared_pending,
        local_state.shelved_until,
        local_state.shelved_meta,
        local_state.pending_deadlines,
        local_state.raised_at,
        local_state.onset_at,
    ):
        for rule_id in [rid for rid in mapping if rid not in rule_ids]:
            mapping.pop(rule_id, None)
    local_state.acked &= rule_ids


def next_debounce_deadline(engine_state: AlarmEngineState | None = None) -> datetime | None:
    """Earliest instant a pending debounce would latch, or None."""
    local_state = engine_state or _alarm_engine_state
    if not local_state.pending_deadlines:
        return None
    return min(local_state.pending_deadlines.values())


def _iso(ts: datetime) -> str:
    return ts.isoformat().replace("+00:00", "Z")


def _forget(local_state: AlarmEngineState, rule_id: str) -> None:
    local_state.condition_true_since.pop(rule_id, None)
    local_state.pending_deadlines.pop(rule_id, None)


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
            _forget(local_state, rule.id)
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
                local_state.pending_deadlines[rule.id] = first_true + timedelta(
                    milliseconds=delay_ms
                )
                if was_active and (rule.latching or rule.requires_ack):
                    active_records.append(state.active_alarms[rule.id])
                continue
            local_state.pending_deadlines.pop(rule.id, None)
            if not was_active or rule.id not in local_state.raised_at:
                local_state.raised_at[rule.id] = now
                local_state.onset_at[rule.id] = first_true

            record = {
                "alarm_id": rule.id,
                "asset_id": rule.asset_id or tag.asset_id,
                "tag_id": rule.tag,
                "severity": severity,
                "message": rule.message,
                "raised_at": _iso(local_state.raised_at[rule.id]),
                "onset_at": _iso(local_state.onset_at.get(rule.id, first_true)),
                "value": tag.value,
                "acked": rule.id in local_state.acked,
                "priority": rule.priority,
                "quality": tag.quality,
                "evidence": {
                    "tag_id": rule.tag,
                    "observed_value": tag.value,
                    "comparator": rule.condition.op,
                    "threshold": rule.condition.threshold or rule.condition.critical or rule.condition.warning,
                    "quality": tag.quality,
                },
            }
            active_records.append(record)
        else:
            _forget(local_state, rule.id)
            if was_active and rule.latching and rule.id not in local_state.acked:
                active_records.append(state.active_alarms[rule.id])
            elif was_active and rule.requires_ack and rule.id not in local_state.acked:
                active_records.append(state.active_alarms[rule.id])

    still_active = {record["alarm_id"] for record in active_records}
    for rule_id in list(local_state.raised_at):
        if rule_id not in still_active:
            local_state.raised_at.pop(rule_id, None)
            local_state.onset_at.pop(rule_id, None)

    return active_records


def shelve_alarm(rule_id: str, *, until: datetime, reason: str, by: str, now: datetime) -> None:
    local_state = _alarm_engine_state
    local_state.shelved_until[rule_id] = until
    local_state.shelved_meta[rule_id] = {
        "reason": reason,
        "by": by,
        "at": now.isoformat().replace("+00:00", "Z"),
        "until": until.isoformat().replace("+00:00", "Z"),
    }


def unshelve_alarm(rule_id: str) -> bool:
    local_state = _alarm_engine_state
    local_state.shelved_meta.pop(rule_id, None)
    return local_state.shelved_until.pop(rule_id, None) is not None


def list_shelved(now: datetime) -> list[dict[str, str]]:
    """Shelved alarms that are still within their shelve window (expired ones auto-return)."""
    local_state = _alarm_engine_state
    out = []
    for rule_id, until in sorted(local_state.shelved_until.items()):
        if now < until:
            out.append({"alarm_id": rule_id, **local_state.shelved_meta.get(rule_id, {})})
    return out


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