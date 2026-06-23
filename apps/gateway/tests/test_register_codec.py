"""Register codec tests."""

import pytest

from gateway.register_codec import CodecError, decode, encode


def test_uint16_decode():
    assert decode([420], "uint16", scale=0.1) == 42


def test_int16_scaled_decode_preserves_decimal_points():
    assert decode([567], "int16", scale=0.1) == 56.7
    assert decode([12345], "int16", scale=0.01) == 123.45


def test_float32_be_decode():
    hi, lo = encode(48.5, "float32_be")
    assert abs(decode([hi, lo], "float32_be") - 48.5) < 0.01


def test_float32_cdab_decode():
    assert abs(decode([0xF213, 0x41D3], "float32_cdab") - 26.4932) < 0.01


def test_short_read_fails_closed():
    with pytest.raises(CodecError):
        decode([1], "float32_be")


def test_bool_codec():
    assert decode([1], "bool") is True
    assert decode([0], "bool") is False
