"""End-to-end pipeline tests without hardware."""

import struct
from datetime import datetime, timezone

import pytest

from action_evaluator import evaluate_actions_for_situation
from alarm_engine import get_active_alarms, process_frames, reset_state as reset_alarms
from calm_card import generate_calm_card
from dag_engine import get_situations, process_alarm_event, reset_state as reset_dag
from model_loader import get_model, get_tag
from modbus_poller import _build_frames_from_registers
from tag_decoder import TagFrame, decode_float32, frames_to_dict, make_tag_frame
from websocket_hub import (
    make_alarm_message,
    make_conn_status_message,
    make_live_message,
    make_situation_message,
)


def _float_to_registers(value: float) -> list[int]:
    raw = struct.pack('>f', value)
    return list(struct.unpack('>HH', raw))


def _all_good_registers(values: dict[str, float]) -> list[int]:
    """Build 42-register block from tag_id -> float value map."""
    regs = [0] * 42
    for tag_id, value in values.items():
        tag = get_tag(tag_id)
        addr = tag.channel_ref['address']
        hi, lo = _float_to_registers(value)
        regs[addr] = hi
        regs[addr + 1] = lo
    return regs


def _frame(tag_id: str, value: float, quality: str = 'GOOD') -> TagFrame:
    tag = get_tag(tag_id)
    return TagFrame(
        tag_id=tag_id,
        channel_ref=tag.channel_ref,
        raw=_float_to_registers(value),
        value=value,
        unit=tag.unit,
        quality=quality,
        ts=datetime.now(timezone.utc).isoformat(),
        source='modbus_rtu',
    )


@pytest.fixture(autouse=True)
def clean_state():
    reset_alarms()
    reset_dag()
    yield
    reset_alarms()
    reset_dag()


def test_build_frames_from_registers_all_21_tags():
    regs = _all_good_registers({
        'M1.voltage': 48.0,
        'MOTOR.vibration': 2.5,
        'DCBUS.voltage': 48.0,
    })
    frames = _build_frames_from_registers(regs)
    assert len(frames) == 21
    assert frames['M1.voltage'].quality == 'GOOD'
    assert frames['M1.voltage'].value == pytest.approx(48.0, abs=0.01)


def test_build_frames_bad_on_none_registers():
    frames = _build_frames_from_registers(None)
    assert len(frames) == 21
    assert all(f.quality == 'BAD' and f.value is None for f in frames.values())


def test_full_causal_chain_four_alarms_one_situation():
    ts_base = '2026-06-23T10:00:00+00:00'
    chain = [
        ('MOTOR.vibration', 'HIGH', 7.0, '2026-06-23T10:00:00+00:00'),
        ('MOTOR.temperature', 'HIGH', 85.0, '2026-06-23T10:00:30+00:00'),
        ('VFD.current', 'HIGH', 15.0, '2026-06-23T10:01:00+00:00'),
        ('MOTOR.speed', 'LOW', 600.0, '2026-06-23T10:01:20+00:00'),
    ]
    for tag_id, alarm_type, value, ts in chain:
        tag = get_tag(tag_id)
        event = process_frames({tag_id: _frame(tag_id, value)})[0]
        assert event.state == 'ACTIVE'
        process_alarm_event(event)

    situations = get_situations()
    assert len(situations) == 1
    sit = situations[0]
    assert sit.alarm_count == 4
    assert len(sit.edges_traversed) == 3
    assert sit.severity == 'HIGH'


def test_process_frames_motor_overload_scenario():
    frames = {
        'MOTOR.vibration': _frame('MOTOR.vibration', 8.0),
        'MOTOR.temperature': _frame('MOTOR.temperature', 82.0),
        'VFD.current': _frame('VFD.current', 16.0),
        'DCBUS.voltage': _frame('DCBUS.voltage', 40.0),
    }
    events = process_frames(frames)
    active_types = {e.alarm_type for e in events if e.state == 'ACTIVE'}
    assert 'HIGH' in active_types
    assert 'LOW' in active_types
    assert len(get_active_alarms()) >= 3


def test_calm_card_from_situation():
    events = process_frames({'MOTOR.vibration': _frame('MOTOR.vibration', 7.5)})
    process_alarm_event(events[0])
    sit = get_situations()[0]
    card = generate_calm_card(sit)

    assert card.headline == 'Motor M-04 bearing degradation suspected'
    assert card.alarm_count == 1
    assert len(card.check_first) >= 1
    assert 'No automatic action' in card.authority_statement
    assert len(card.evidence) == 1


def test_action_evaluator_allows_operator_inspect():
    events = process_frames({'MOTOR.vibration': _frame('MOTOR.vibration', 7.0)})
    process_alarm_event(events[0])
    sit = get_situations()[0]
    actions = evaluate_actions_for_situation(sit, 'operator')
    inspect = next(a for a in actions if a.action_id == 'INSPECT_MOTOR_BEARING')
    assert inspect.allowed is True
    assert inspect.requires_isolation is True


def test_action_evaluator_blocks_wrong_role():
    events = process_frames({'MOTOR.vibration': _frame('MOTOR.vibration', 7.0)})
    process_alarm_event(events[0])
    sit = get_situations()[0]
    actions = evaluate_actions_for_situation(sit, 'admin')
    inspect = next(a for a in actions if a.action_id == 'INSPECT_MOTOR_BEARING')
    assert inspect.allowed is False


def test_websocket_message_shapes():
    frames = _build_frames_from_registers(_all_good_registers({'M1.voltage': 48.0}))
    live = make_live_message(frames_to_dict(frames))
    assert live['type'] == 'LIVE'
    assert 'M1.voltage' in live['payload']
    assert live['payload']['M1.voltage']['quality'] == 'GOOD'

    events = process_frames({'MOTOR.vibration': _frame('MOTOR.vibration', 7.0)})
    alarm_msg = make_alarm_message(events[0])
    assert alarm_msg['type'] == 'ALARM'
    assert alarm_msg['payload']['alarm_id'] == 'MOTOR.vibration_HIGH'

    process_alarm_event(events[0])
    sit_msg = make_situation_message(get_situations())
    assert sit_msg['type'] == 'SITUATION'
    assert len(sit_msg['payload']) == 1

    conn = make_conn_status_message(False, 'COM3', 0, 3)
    assert conn['type'] == 'CONN_STATUS'
    assert conn['payload']['connected'] is False


def test_decode_all_register_pairs_from_scan_block():
    regs = _all_good_registers({t.tag_id: float(i + 1) for i, t in enumerate(get_model().tag_list)})
    results = []
    for addr in range(0, 42, 2):
        pair = regs[addr:addr + 2]
        val = decode_float32(pair, 'AB')
        results.append(val)
    assert len(results) == 21
    assert all(v is not None for v in results)


def test_hihi_priority_over_high():
    events = process_frames({'MOTOR.vibration': _frame('MOTOR.vibration', 11.0)})
    hihi = [e for e in events if e.alarm_type == 'HIHI']
    high = [e for e in events if e.alarm_type == 'HIGH']
    assert len(hihi) == 1
    assert len(high) == 1
    assert hihi[0].priority == 1