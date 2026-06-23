"""Raw serial line reader tests."""

from __future__ import annotations

from datetime import UTC, datetime

from gateway.raw_serial_reader import LineTagSpec, parse_line_to_frames


TAG_INDEX = {
    "MOTOR_301_CURRENT": LineTagSpec(
        tag_id="MOTOR_301_CURRENT",
        asset_id="MTR-301",
        unit="A",
    ),
    "BUS_101_V": LineTagSpec(
        tag_id="BUS_101_V",
        asset_id="BUS-101",
        unit="V",
    ),
}
NOW = datetime(2026, 6, 22, 12, 0, tzinfo=UTC)


def test_parse_tag_equals_value_line():
    frames = parse_line_to_frames(
        "MOTOR_301_CURRENT=42.5",
        tag_index=TAG_INDEX,
        default_tag_id="MOTOR_301_CURRENT",
        gateway_id="gw-test",
        first_seq=10,
        now=NOW,
    )
    assert len(frames) == 1
    assert frames[0].tag_id == "MOTOR_301_CURRENT"
    assert frames[0].asset_id == "MTR-301"
    assert frames[0].value == 42.5
    assert frames[0].unit == "A"
    assert frames[0].source == "modbus_rtu"
    assert frames[0].seq == 10


def test_parse_bare_number_uses_default_tag():
    frames = parse_line_to_frames(
        "43.1",
        tag_index=TAG_INDEX,
        default_tag_id="MOTOR_301_CURRENT",
        gateway_id="gw-test",
        first_seq=11,
        now=NOW,
    )
    assert len(frames) == 1
    assert frames[0].tag_id == "MOTOR_301_CURRENT"
    assert frames[0].value == 43.1


def test_parse_multiple_pairs_in_one_line():
    frames = parse_line_to_frames(
        "MOTOR_301_CURRENT=44.0,BUS_101_V=47.5",
        tag_index=TAG_INDEX,
        default_tag_id="MOTOR_301_CURRENT",
        gateway_id="gw-test",
        first_seq=20,
        now=NOW,
    )
    assert [frame.tag_id for frame in frames] == ["MOTOR_301_CURRENT", "BUS_101_V"]
    assert [frame.seq for frame in frames] == [20, 21]


def test_parse_json_tag_value_object():
    frames = parse_line_to_frames(
        '{"MOTOR_301_CURRENT": 45.2, "BUS_101_V": 46.8}',
        tag_index=TAG_INDEX,
        default_tag_id="MOTOR_301_CURRENT",
        gateway_id="gw-test",
        first_seq=30,
        now=NOW,
    )
    assert [frame.value for frame in frames] == [45.2, 46.8]


def test_parse_unknown_tag_falls_back_to_default_tag():
    frames = parse_line_to_frames(
        "CURRENT=46.0",
        tag_index=TAG_INDEX,
        default_tag_id="MOTOR_301_CURRENT",
        gateway_id="gw-test",
        first_seq=40,
        now=NOW,
    )
    assert len(frames) == 1
    assert frames[0].tag_id == "MOTOR_301_CURRENT"
    assert frames[0].value == 46.0
