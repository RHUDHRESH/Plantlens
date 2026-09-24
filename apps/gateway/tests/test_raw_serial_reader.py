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
    # Line frames are stamped with the contract's serial-line source, never "modbus_rtu".
    assert frames[0].source == "serial_line"
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


def test_parse_unknown_tag_is_rejected_not_remapped():
    """Behaviour change: an unknown/garbled key used to be published as the default tag
    (a wrong GOOD value). It is now rejected and counted."""
    frames = parse_line_to_frames(
        "CURRENT=46.0",
        tag_index=TAG_INDEX,
        default_tag_id="MOTOR_301_CURRENT",
        gateway_id="gw-test",
        first_seq=40,
        now=NOW,
    )
    assert frames == []


def test_parse_full_tagframe_json_with_bad_value_does_not_raise():
    frames = parse_line_to_frames(
        '{"tag_id": "BUS_101_V", "asset_id": "BUS-101", "value": [1], "unit": "V", "quality": "GOOD",'
        ' "timestamp": "2026-01-01T00:00:00Z", "source": "modbus_rtu"}',
        tag_index=TAG_INDEX,
        default_tag_id="MOTOR_301_CURRENT",
        gateway_id="gw-test",
        first_seq=50,
        now=NOW,
    )
    assert frames == []


def test_parse_nan_is_bad_not_good():
    frames = parse_line_to_frames(
        "MOTOR_301_CURRENT=nan",
        tag_index=TAG_INDEX,
        default_tag_id="MOTOR_301_CURRENT",
        gateway_id="gw-test",
        first_seq=60,
        now=NOW,
    )
    assert [(f.quality, f.value) for f in frames] == [("BAD", None)]
