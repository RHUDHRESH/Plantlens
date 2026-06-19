"""Situation engine unit tests."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from app.runtime.config_loader import load_runtime_config
from app.runtime.runtime_state import RuntimeState
from app.runtime.situation_engine import evaluate_situations
from app.schemas.tag_frame import TagFrame

REPO_ROOT = Path(__file__).resolve().parents[3]
DEMO_DIR = REPO_ROOT / "packages" / "sample-data" / "demo-microgrid"
TS = datetime(2026, 6, 18, 12, 0, 0, tzinfo=timezone.utc)


def _graph_index():
    return load_runtime_config("demo", sample_data_dir=DEMO_DIR).graph_index


def _motor_overload_alarms():
    return [
        {
            "alarm_id": "MOTOR_CURRENT_HIGH",
            "asset_id": "MTR-301",
            "tag_id": "MOTOR_301_CURRENT",
            "raised_at": "2026-06-18T12:00:02Z",
            "severity": "warning",
            "message": "Motor current high",
        },
        {
            "alarm_id": "MOTOR_SPEED_LOW",
            "asset_id": "MTR-301",
            "tag_id": "MOTOR_301_RPM",
            "raised_at": "2026-06-18T12:00:04Z",
            "severity": "warning",
            "message": "Motor speed low",
        },
        {
            "alarm_id": "DC_BUS_LOW",
            "asset_id": "BUS-101",
            "tag_id": "BUS_101_V",
            "raised_at": "2026-06-18T12:00:06Z",
            "severity": "critical",
            "message": "DC bus low",
        },
        {
            "alarm_id": "INV_UNDERVOLTAGE",
            "asset_id": "INV-102",
            "tag_id": "INV_102_UNDERVOLTAGE",
            "raised_at": "2026-06-18T12:00:07.500Z",
            "severity": "warning",
            "message": "Inverter undervoltage",
        },
    ]


def test_motor_overload_situation_matches_config():
    state = RuntimeState()
    graph_index = _graph_index()
    situations, trace = evaluate_situations(state, _motor_overload_alarms(), graph_index)
    assert len(situations) == 1
    assert situations[0]["situation_type"] == "MOTOR_MECHANICAL_OVERLOAD"
    assert situations[0]["root_asset_id"] == "MTR-301"
    assert trace is not None
    assert trace.selected_root == "MTR-301"


def test_pv_generation_loss_matches_config():
    state = RuntimeState()
    state.update_tag(
        TagFrame(
            tag_id="PV_101_I",
            asset_id="PV-101",
            value=1.2,
            unit="A",
            quality="GOOD",
            timestamp=TS,
            source="simulator",
        )
    )
    alarms = [
        {
            "alarm_id": "DC_BUS_LOW",
            "asset_id": "BUS-101",
            "tag_id": "BUS_101_V",
            "raised_at": "2026-06-18T12:00:05.200Z",
            "severity": "critical",
            "message": "DC bus low",
        }
    ]
    situations, _trace = evaluate_situations(state, alarms, _graph_index())
    assert len(situations) == 1
    assert situations[0]["situation_type"] == "PV_GENERATION_LOSS"
    assert situations[0]["root_asset_id"] == "PV-101"


def test_low_confidence_stale_data_gives_no_situation():
    state = RuntimeState()
    state.update_tag(
        TagFrame(
            tag_id="MOTOR_301_CURRENT",
            asset_id="MTR-301",
            value=3.4,
            unit="A",
            quality="STALE",
            timestamp=TS,
            source="simulator",
        )
    )
    situations, trace = evaluate_situations(state, [], _graph_index())
    assert situations == []
    assert trace is None


def test_unrelated_alarms_not_grouped_into_motor_situation():
    state = RuntimeState()
    alarms = [
        {
            "alarm_id": "DC_BUS_LOW",
            "asset_id": "BUS-101",
            "tag_id": "BUS_101_V",
            "raised_at": "2026-06-18T12:00:02Z",
            "severity": "critical",
            "message": "DC bus low",
        },
        {
            "alarm_id": "INV_UNDERVOLTAGE",
            "asset_id": "INV-102",
            "tag_id": "INV_102_UNDERVOLTAGE",
            "raised_at": "2026-06-18T12:00:03Z",
            "severity": "warning",
            "message": "Inverter undervoltage",
        },
    ]
    situations, _trace = evaluate_situations(state, alarms, _graph_index())
    assert situations == []


def test_raw_alarms_retained_in_grouped_ids():
    state = RuntimeState()
    alarms = _motor_overload_alarms()
    situations, _trace = evaluate_situations(state, alarms, _graph_index())
    grouped = set(situations[0]["grouped_alarm_ids"])
    assert {"MOTOR_CURRENT_HIGH", "MOTOR_SPEED_LOW", "DC_BUS_LOW"}.issubset(grouped)