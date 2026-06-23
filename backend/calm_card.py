from dataclasses import dataclass
from typing import Optional

from dag_engine import Situation
from model_loader import get_model


@dataclass
class EvidenceRow:
    signal: str
    value: str
    direction: str
    quality: str
    confirmed: bool


@dataclass
class CalmCard:
    situation_id: str
    headline: str
    severity: str
    confidence: float
    alarm_count: int
    first_signal_tag: str
    first_signal_ts: str
    what_happened: str
    evidence: list[EvidenceRow]
    missing_evidence: list[str]
    what_could_be_wrong: list[str]
    check_first: list[str]
    projected_consequence: str
    time_to_limit_min: Optional[float]
    authority_statement: str


def generate_calm_card(situation: Situation) -> CalmCard:
    model = get_model()
    templates = model.templates.get('situations', {}).get(situation.root_alarm_id, {})

    evidence: list[EvidenceRow] = []
    for alarm in situation.alarms:
        tag_def = next((t for t in model.tag_list if t.tag_id == alarm.tag_id), None)
        if not tag_def:
            continue

        direction = '↑ rising' if alarm.alarm_type in ('HIGH', 'HIHI') else '↓ falling'
        value_str = f"{alarm.process_value:.1f} {alarm.unit}" if alarm.process_value is not None else '—'

        evidence.append(EvidenceRow(
            signal=tag_def.description,
            value=value_str,
            direction=direction,
            quality='CONFIRMED',
            confirmed=True,
        ))

    missing: list[str] = []
    alarm_tags = {a.tag_id for a in situation.alarms}
    if 'MOTOR.speed' not in alarm_tags and situation.root_equipment_id == 'MOTOR-M04':
        missing.append('Motor speed data unavailable')

    first_alarm = situation.alarms[0]
    what_happened = templates.get('what_happened', situation.projected_consequence)
    what_happened = what_happened.replace(
        '{first_signal_time}', first_alarm.ts[11:19]
    ).replace(
        '{time_to_limit}',
        f'{situation.time_to_limit_min:.0f} min' if situation.time_to_limit_min else 'unknown',
    )

    return CalmCard(
        situation_id=situation.situation_id,
        headline=situation.title,
        severity=situation.severity,
        confidence=situation.confidence,
        alarm_count=situation.alarm_count,
        first_signal_tag=first_alarm.tag_id,
        first_signal_ts=first_alarm.ts,
        what_happened=what_happened,
        evidence=evidence,
        missing_evidence=missing,
        what_could_be_wrong=templates.get('counter_evidence', []),
        check_first=templates.get('check_first', []),
        projected_consequence=situation.projected_consequence,
        time_to_limit_min=situation.time_to_limit_min,
        authority_statement=templates.get(
            'authority',
            'No automatic action taken. Operator confirmation required.',
        ),
    )