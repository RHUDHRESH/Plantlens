"""Rule R3: every frame the gateway produces validates against packages/contracts/tag_frame.schema.json."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

import jsonschema
import pytest
from pydantic import ValidationError

from gateway.line.protocols import LineDecoder, build_pl1
from gateway.line.reader import readings_to_frames
from gateway.raw_serial_reader import build_line_tag_index
from gateway.tag_frame import TagFrame

REPO_ROOT = Path(__file__).resolve().parents[3]
SCHEMA = json.loads((REPO_ROOT / "packages/contracts/tag_frame.schema.json").read_text(encoding="utf-8"))
TAG_MAP = json.loads((REPO_ROOT / "packages/sample-data/demo-microgrid/tag_map.json").read_text(encoding="utf-8"))
VALIDATOR = jsonschema.Draft202012Validator(SCHEMA, format_checker=jsonschema.FormatChecker())
NOW = datetime(2026, 9, 24, 12, 0, tzinfo=UTC)


def base(**kw):
    data = dict(tag_id="BUS_101_V", asset_id="BUS-101", value=48.0, unit="V", quality="GOOD", timestamp=NOW, source="modbus_rtu")
    data.update(kw)
    return data


def test_model_fields_match_schema_properties():
    assert set(TagFrame.model_fields) == set(SCHEMA["properties"])
    required = {name for name, f in TagFrame.model_fields.items() if f.is_required()}
    assert required == set(SCHEMA["required"])
    source_enum = TagFrame.model_fields["source"].annotation.__args__  # type: ignore[union-attr]
    assert set(source_enum) == set(SCHEMA["properties"]["source"]["enum"])


@pytest.mark.parametrize(
    "frame",
    [
        TagFrame(**base()),
        TagFrame(**base(value=None, quality="STALE", seq=0, gateway_id="gw")),
        TagFrame(**base(value=True, unit="bool", source="modbus_tcp", ingest_ts=NOW, scenario_id="s1")),
        TagFrame(**base(value="RUN", quality="UNCERTAIN", source="manual", timestamp=NOW.astimezone(timezone(timedelta(hours=2))))),
    ],
)
def test_frames_validate_against_json_schema(frame: TagFrame):
    VALIDATOR.validate(frame.to_contract())


def test_line_frames_from_demo_tag_map_validate():
    index = build_line_tag_index(TAG_MAP)
    decoder = LineDecoder(index, column_map={"A0": "VIB_X", "A1": "MOTOR_301_CURRENT"})
    readings = decoder.decode(build_pl1(1, {"A0": "1.5", "A1": "nan"}))
    frames = readings_to_frames(readings, tag_index=index, gateway_id="gw", source="manual", first_seq=1, now=NOW)
    assert len(frames) == 2
    for f in frames:
        VALIDATOR.validate(f.to_contract())


@pytest.mark.parametrize(
    "bad",
    [
        base(tag_id="bus_101_v"),
        base(asset_id="BUS 101"),
        base(timestamp=datetime(2026, 1, 1)),  # naive
        base(source="serial"),
        base(value=float("nan")),
        base(value=None, quality="GOOD"),
        base(seq=-1),
        base(extra="x"),
    ],
)
def test_invalid_frames_rejected_like_the_api(bad):
    with pytest.raises(ValidationError):
        TagFrame(**bad)
