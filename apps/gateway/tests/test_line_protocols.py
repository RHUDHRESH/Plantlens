"""Framer and line-protocol tests, including hypothesis property tests."""

from __future__ import annotations

import math

from hypothesis import given, settings
from hypothesis import strategies as st

from gateway.line.framer import LineFramer
from gateway.line.protocols import LineDecoder, LineTagSpec, build_pl1, crc8, parse_scalar

TAGS = {
    t: LineTagSpec(t, a, u)
    for t, a, u in [
        ("VIB_X", "VIB-301", "mm/s"),
        ("VIB_Y", "VIB-301", "mm/s"),
        ("MOTOR_301_CURRENT", "MTR-301", "A"),
        ("BUS_101_V", "BUS-101", "V"),
    ]
}
COLS = {"A0": "VIB_X", "A1": "VIB_Y", "current": "MOTOR_301_CURRENT"}


def decoder(**kw: object) -> LineDecoder:
    return LineDecoder(TAGS, column_map=COLS, **kw)  # type: ignore[arg-type]


# ---------------------------------------------------------------- framer
def test_framer_joins_split_lines_and_accepts_crlf():
    f = LineFramer()
    assert f.feed(b"A0=1") == []
    assert f.feed(b".5\r") == []
    assert f.feed(b"\nA1=2\r\nA0") == ["A0=1.5", "A1=2"]
    assert f.pending == 2  # partial stays buffered, never emitted


def test_framer_overflow_discards_until_newline():
    f = LineFramer(max_line_bytes=16)
    assert f.feed(b"X" * 40) == []
    assert f.feed(b"still-junk\nA0=1\n") == ["A0=1"]
    assert f.stats.overflow_discards == 1


def test_framer_drops_invalid_utf8_and_control_bytes():
    f = LineFramer()
    assert f.feed(b"\xff\xfeA0=1\nA0=\x00\x07 2\nA0=3\n") == ["A0=3"]
    assert f.stats.invalid_utf8 == 1
    assert f.stats.control_bytes == 1


def test_framer_reset_discards_first_partial_line():
    f = LineFramer()
    f.reset(discard_until_newline=True)
    assert f.feed(b"=12.5,A1=3\nA0=1\n") == ["A0=1"]


@settings(max_examples=200, deadline=None)
@given(
    lines=st.lists(st.text(alphabet=st.characters(min_codepoint=0x20, max_codepoint=0x7E), min_size=1, max_size=60), max_size=20),
    cuts=st.lists(st.integers(min_value=0, max_value=2000), max_size=30),
)
def test_framer_is_split_invariant(lines: list[str], cuts: list[int]):
    """However the byte stream is chunked, the same complete lines come out, in order."""
    stream = b"".join(line.encode() + b"\n" for line in lines)
    points = sorted({c % (len(stream) + 1) for c in cuts})
    chunks = [stream[a:b] for a, b in zip([0, *points], [*points, len(stream)], strict=True)]
    f = LineFramer()
    out = [line for chunk in chunks for line in f.feed(chunk)]
    assert out == [line.strip(" ") for line in lines if line.strip(" ")]


@settings(max_examples=300, deadline=None)
@given(st.binary(max_size=2048))
def test_framer_and_decoder_never_raise_on_garbage(data: bytes):
    f = LineFramer(max_line_bytes=64)
    d = decoder(default_tag_id="MOTOR_301_CURRENT")
    for line in f.feed(data):
        assert len(line.encode()) <= 64
        for reading in d.decode(line):
            assert reading.tag_id in TAGS
            if reading.quality == "GOOD" and isinstance(reading.value, float):
                assert math.isfinite(reading.value)


# ---------------------------------------------------------------- PL1
def test_crc8_check_value():
    assert crc8(b"123456789") == 0xF4


def test_pl1_valid_line_and_checksum_failure():
    d = decoder()
    line = build_pl1(1, {"A0": "1.25", "A1": "1e3"})
    readings = d.decode(line)
    assert [(r.tag_id, r.value, r.quality) for r in readings] == [("VIB_X", 1.25, "GOOD"), ("VIB_Y", 1000.0, "GOOD")]
    corrupted = line.replace("1.25", "1.26")
    assert d.decode(corrupted) == []
    assert d.stats.checksum_failures == 1
    assert d.decode(line.split("*")[0]) == []  # no checksum at all
    assert d.stats.rejected["pl1_no_checksum"] == 1


def test_pl1_seq_gaps_and_restart():
    d = decoder()
    for seq in (10, 11, 14, 15, 0, 1):
        d.decode(build_pl1(seq, {"A0": 1}))
    assert d.stats.seq_gaps == 2
    assert d.stats.seq_restarts == 1


def test_pl1_nan_inf_and_quality_suffix_are_not_good():
    d = decoder()
    readings = d.decode(build_pl1(1, {"A0": "nan", "A1": "inf", "current": "4095~B"}))
    assert [(r.value, r.quality) for r in readings] == [(None, "BAD"), (None, "BAD"), (4095.0, "BAD")]


def test_pl1_unknown_keys_rejected_not_remapped():
    d = decoder()
    readings = d.decode(build_pl1(1, {"A0": 1, "BOGUS": 2}))
    assert [r.tag_id for r in readings] == ["VIB_X"]
    assert d.stats.unknown_keys["BOGUS"] == 1


@settings(max_examples=200, deadline=None)
@given(
    seq=st.integers(min_value=0, max_value=2**32 - 1),
    values=st.lists(st.floats(allow_nan=True, allow_infinity=True, width=32), min_size=1, max_size=2),
)
def test_pl1_roundtrip_property(seq: int, values: list[float]):
    keys = ["A0", "A1"][: len(values)]
    line = build_pl1(seq, {k: repr(v) for k, v in zip(keys, values, strict=True)})
    readings = decoder().decode(line)
    assert len(readings) == len(values)
    for reading, value in zip(readings, values, strict=True):
        if math.isfinite(value):
            assert reading.quality == "GOOD" and reading.value == float(repr(value))
        else:
            assert reading.quality == "BAD" and reading.value is None


# ---------------------------------------------------------------- CSV
def test_csv_header_driven_with_separators():
    for sep in (",", ";", "\t"):
        d = decoder()
        assert d.decode(sep.join(["seq", "timestamp_ms", "A0", "A1", "unused"])) == []
        readings = d.decode(sep.join(["1", "1000", "1.5", "2.5e1", "9"]))
        assert [(r.tag_id, r.value) for r in readings] == [("VIB_X", 1.5), ("VIB_Y", 25.0)]


def test_csv_decimal_comma_with_semicolon_and_quality_column():
    d = decoder()
    d.decode("A0;A1;quality")
    readings = d.decode("1,5;2;BAD")
    assert [(r.value, r.quality) for r in readings] == [(1.5, "BAD"), (2.0, "BAD")]


def test_csv_rows_without_header_or_wrong_width_are_rejected():
    d = decoder(protocol="csv")
    assert d.decode("1,2,3") == []
    assert d.stats.rejected["csv_no_header"] == 1
    d.decode("A0,A1")
    assert d.decode("1,2,3") == []
    assert d.stats.rejected["csv_width"] == 1


def test_csv_configured_header_and_header_change():
    d = decoder(csv_header="A0,A1")
    assert [r.value for r in d.decode("1,2")] == [1.0, 2.0]
    d.decode("A1,A0")
    assert [(r.tag_id, r.value) for r in d.decode("1,2")] == [("VIB_Y", 1.0), ("VIB_X", 2.0)]
    assert d.stats.header_changes == 1


# ---------------------------------------------------------------- legacy kv + JSON
def test_kv_unknown_keys_are_rejected_and_counted():
    d = decoder(default_tag_id="MOTOR_301_CURRENT")
    assert d.decode("AMPS=46.0") == []
    assert d.stats.unknown_keys["AMPS"] == 1
    assert d.stats.rejected["kv_no_known_keys"] == 1


def test_kv_tab_semicolon_and_exponent():
    d = decoder()
    readings = d.decode("MOTOR_301_CURRENT=1e3;BUS_101_V : 47.5\tVIB_X=nan")
    assert [(r.tag_id, r.value, r.quality) for r in readings] == [
        ("MOTOR_301_CURRENT", 1000.0, "GOOD"),
        ("BUS_101_V", 47.5, "GOOD"),
        ("VIB_X", None, "BAD"),
    ]


def test_json_lines_never_raise():
    d = decoder()
    assert [(r.tag_id, r.value) for r in d.decode('{"tag": "VIB_X", "value": 3.5}')] == [("VIB_X", 3.5)]
    assert d.decode('{"tag": "VIB_X", "value": [1, 2]}') == []
    assert d.decode("[1, 2, 3]") == []
    assert d.decode('{"tag": "VIB_X", "value": ') == []
    assert d.decode('{"tag_id": "BUS_101_V", "asset_id": "bad id", "value": NaN, "quality": "GOOD"}')[0].quality == "BAD"
    assert d.stats.rejected["json_bad_value"] == 1
    assert d.stats.rejected["json_not_object"] == 1
    assert d.stats.rejected["json_invalid"] == 1


def test_comment_and_banner_lines_ignored():
    d = decoder()
    assert d.decode("#PLANTLENS READY v1") == []
    assert d.stats.comments == 1 and d.stats.rejected_lines == 0


def test_parse_scalar_edge_cases():
    assert parse_scalar("1e3") == (1000.0, "GOOD")
    assert parse_scalar("-.5") == (-0.5, "GOOD")
    assert parse_scalar("1e999") == (None, "BAD")
    assert parse_scalar("true") == (True, "GOOD")
