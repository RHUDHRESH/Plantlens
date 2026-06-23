import struct

import pytest

from model_loader import get_tag
from tag_decoder import decode_float32, make_tag_frame


def _float_to_registers(value: float) -> list[int]:
    raw = struct.pack('>f', value)
    hi, lo = struct.unpack('>HH', raw)
    return [hi, lo]


def test_decode_float32_ab():
    regs = _float_to_registers(48.5)
    assert decode_float32(regs, 'AB') == pytest.approx(48.5)


def test_decode_float32_rejects_nan():
    regs = _float_to_registers(float('nan'))
    assert decode_float32(regs, 'AB') is None


def test_make_tag_frame_bad_on_error():
    tag = get_tag('M1.voltage')
    frame = make_tag_frame(tag, None, error=True)
    assert frame.quality == 'BAD'
    assert frame.value is None


def test_make_tag_frame_good_value():
    tag = get_tag('MOTOR.vibration')
    frame = make_tag_frame(tag, _float_to_registers(3.2))
    assert frame.quality == 'GOOD'
    assert frame.value == pytest.approx(3.2, abs=0.01)