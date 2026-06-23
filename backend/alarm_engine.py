from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal, Optional

from model_loader import TagDefinition, get_model
from tag_decoder import TagFrame


@dataclass
class AlarmEvent:
    alarm_id: str
    tag_id: str
    equipment_id: str
    zone: str
    state: Literal['ACTIVE', 'CLEAR']
    priority: int
    alarm_type: Literal['HIGH', 'LOW', 'HIHI', 'LOLO']
    threshold: float
    process_value: Optional[float]
    unit: str
    message: str
    ts: str


_active: dict[str, AlarmEvent] = {}
_recent_events: list[str] = []


def _make_alarm_id(tag_id: str, alarm_type: str) -> str:
    return f"{tag_id}_{alarm_type}"


def _check_tag(tag_def: TagDefinition, frame: TagFrame) -> list[AlarmEvent]:
    new_events: list[AlarmEvent] = []
    now = datetime.now(timezone.utc).isoformat()

    if frame.quality == 'BAD' or frame.value is None:
        return []

    v = frame.value

    thresholds = [
        ('HIHI', tag_def.hihi, v >= tag_def.hihi if tag_def.hihi is not None else False),
        ('HIGH', tag_def.alarm_high, v >= tag_def.alarm_high if tag_def.alarm_high is not None else False),
        ('LOW', tag_def.alarm_low, v <= tag_def.alarm_low if tag_def.alarm_low is not None else False),
        ('LOLO', tag_def.lolo, v <= tag_def.lolo if tag_def.lolo is not None else False),
    ]

    for alarm_type, threshold, is_breached in thresholds:
        if threshold is None:
            continue

        alarm_id = _make_alarm_id(tag_def.tag_id, alarm_type)

        if is_breached and alarm_id not in _active:
            event = AlarmEvent(
                alarm_id=alarm_id,
                tag_id=tag_def.tag_id,
                equipment_id=tag_def.equipment_id,
                zone=tag_def.zone,
                state='ACTIVE',
                priority=tag_def.alarm_priority,
                alarm_type=alarm_type,
                threshold=threshold,
                process_value=v,
                unit=tag_def.unit,
                message=f"{tag_def.description} {alarm_type.lower()} ({v:.1f} {tag_def.unit}, limit {threshold})",
                ts=now,
            )
            _active[alarm_id] = event
            _recent_events.append(now)
            new_events.append(event)

        elif not is_breached and alarm_id in _active:
            cleared = _active.pop(alarm_id)
            cleared.state = 'CLEAR'
            cleared.ts = now
            new_events.append(cleared)

    return new_events


def process_frames(frames: dict[str, TagFrame]) -> list[AlarmEvent]:
    model = get_model()
    changed: list[AlarmEvent] = []

    for tag_def in model.tag_list:
        frame = frames.get(tag_def.tag_id)
        if frame:
            changed.extend(_check_tag(tag_def, frame))

    cutoff = datetime.now(timezone.utc).timestamp() - 600
    _recent_events[:] = [
        ts for ts in _recent_events
        if datetime.fromisoformat(ts).timestamp() > cutoff
    ]

    return changed


def get_active_alarms() -> list[AlarmEvent]:
    return list(_active.values())


def get_alarm_rate_per_10min() -> int:
    return len(_recent_events)


def get_active_alarm_by_id(alarm_id: str) -> Optional[AlarmEvent]:
    return _active.get(alarm_id)


def reset_state() -> None:
    """Clear in-memory alarm state (for tests)."""
    _active.clear()
    _recent_events.clear()