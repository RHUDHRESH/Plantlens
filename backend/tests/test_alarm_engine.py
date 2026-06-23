from alarm_engine import get_active_alarms, process_frames
from model_loader import get_model
from tag_decoder import TagFrame


def _frame(tag_id: str, value: float) -> TagFrame:
    tag = next(t for t in get_model().tag_list if t.tag_id == tag_id)
    return TagFrame(
        tag_id=tag_id,
        channel_ref=tag.channel_ref,
        raw=[0, 0],
        value=value,
        unit=tag.unit,
        quality='GOOD',
        ts='2026-06-23T10:00:00+00:00',
        source='modbus_rtu',
    )


def test_motor_vibration_high_fires():
    events = process_frames({'MOTOR.vibration': _frame('MOTOR.vibration', 7.0)})
    assert any(e.alarm_type == 'HIGH' and e.state == 'ACTIVE' for e in events)
    assert any(a.alarm_id == 'MOTOR.vibration_HIGH' for a in get_active_alarms())


def test_alarm_clears_when_value_returns():
    process_frames({'MOTOR.vibration': _frame('MOTOR.vibration', 7.0)})
    events = process_frames({'MOTOR.vibration': _frame('MOTOR.vibration', 2.0)})
    assert any(e.state == 'CLEAR' for e in events)
    assert not get_active_alarms()


def test_bad_quality_does_not_clear():
    process_frames({'MOTOR.vibration': _frame('MOTOR.vibration', 7.0)})
    bad = _frame('MOTOR.vibration', 7.0)
    bad.quality = 'BAD'
    bad.value = None
    events = process_frames({'MOTOR.vibration': bad})
    assert events == []
    assert get_active_alarms()