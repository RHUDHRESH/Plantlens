from alarm_engine import AlarmEvent, process_frames
from dag_engine import get_situations, process_alarm_event
from tag_decoder import TagFrame
from model_loader import get_model


def _alarm_event(tag_id: str, alarm_type: str, value: float, ts: str) -> AlarmEvent:
    tag = next(t for t in get_model().tag_list if t.tag_id == tag_id)
    return AlarmEvent(
        alarm_id=f'{tag_id}_{alarm_type}',
        tag_id=tag_id,
        equipment_id=tag.equipment_id,
        zone=tag.zone,
        state='ACTIVE',
        priority=tag.alarm_priority,
        alarm_type=alarm_type,
        threshold=6.0,
        process_value=value,
        unit=tag.unit,
        message='test',
        ts=ts,
    )


def test_causal_chain_groups_alarms():
    process_alarm_event(_alarm_event('MOTOR.vibration', 'HIGH', 7.0, '2026-06-23T10:00:00+00:00'))
    process_alarm_event(_alarm_event('MOTOR.temperature', 'HIGH', 85.0, '2026-06-23T10:00:30+00:00'))

    situations = get_situations()
    assert len(situations) == 1
    assert situations[0].alarm_count == 2
    assert 'edge_001' in situations[0].edges_traversed


def test_standalone_situation_for_root_alarm():
    process_alarm_event(_alarm_event('DCBUS.voltage', 'LOW', 40.0, '2026-06-23T10:00:00+00:00'))
    situations = get_situations()
    assert len(situations) == 1
    assert situations[0].alarm_count == 1