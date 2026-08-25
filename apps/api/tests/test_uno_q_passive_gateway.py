"""CRC/parser regression tests for the UNO Q passive RS485 deployment."""

from __future__ import annotations

import importlib.util
from pathlib import Path


MODULE_PATH = (
    Path(__file__).resolve().parents[3]
    / "deploy"
    / "uno-q"
    / "plantlens_app"
    / "python"
    / "passive_gateway.py"
)
SPEC = importlib.util.spec_from_file_location("uno_q_passive_gateway", MODULE_PATH)
assert SPEC and SPEC.loader
passive_gateway = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(passive_gateway)


def test_live_fc03_request_and_response_are_recovered_from_noise():
    # Live slave-6 request HR0/1 and response raw word 246, with a partial
    # leading frame to prove capture-boundary recovery.
    raw = bytes.fromhex("04 00 00 00 00 C9 33 06 03 00 00 00 01 85 BD 06 03 02 00 F6 8D C2")

    frames = passive_gateway.scan_rtu_frames(raw)

    assert [frame.hex(" ").upper() for frame in frames] == [
        "06 03 00 00 00 01 85 BD",
        "06 03 02 00 F6 8D C2",
    ]


def test_live_word_remains_generic_native_data_until_commissioned():
    frames = [
        bytes.fromhex("06 03 00 00 00 01 85 BD"),
        bytes.fromhex("06 03 02 00 F6 8D C2"),
    ]
    gateway = passive_gateway.PassiveGateway()

    observations = gateway._decode(frames)

    assert observations[0]["tag_id"] == "NATIVE_S6_HR_00000"
    assert observations[0]["asset_id"] == "MODBUS-S6"
    assert observations[0]["value"] == 246.0
    assert observations[0]["unit"] == "raw_word"


def test_bridge_payload_requires_matching_declared_count():
    payload = "HEX,06,03,00,00,00,01,85,BD,COUNT,8"
    assert passive_gateway.parse_bridge_payload(payload) == bytes.fromhex(
        "06 03 00 00 00 01 85 BD"
    )


def test_crc_rejects_corrupted_live_frame():
    good = bytes.fromhex("06 03 02 00 F6 8D C2")
    bad = good[:-1] + bytes([good[-1] ^ 0x01])

    assert passive_gateway.scan_rtu_frames(good) == [good]
    assert passive_gateway.scan_rtu_frames(bad) == []
