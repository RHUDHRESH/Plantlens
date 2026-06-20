"""Unit tests for the deterministic bench payload adapter."""

import copy
import json
from copy import deepcopy
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.hmi.bench_adapter import load_bench_payload

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "hmi"
FIXTURE_NAMES = [
    "healthy_motor_fan_blower.json",
    "motor_obstruction.json",
    "voltage_sag.json",
    "airflow_blockage.json",
    "stale_sensor.json",
    "missing_sensor.json",
]


def _load_fixture(name: str) -> dict:
    with (FIXTURES_DIR / name).open(encoding="utf-8") as handle:
        return json.load(handle)


@pytest.mark.parametrize("fixture_name", FIXTURE_NAMES)
def test_all_hmi_fixtures_load(fixture_name: str):
    payload = _load_fixture(fixture_name)
    loaded = load_bench_payload(payload)
    assert loaded.plant_id == "PLANTLENS_DEMO_BENCH"
    assert len(loaded.assets) == 6
    assert len(loaded.signals) == 7
    assert len(loaded.causality_edges) == 4


def test_duplicate_signal_id_fails():
    payload = _load_fixture("healthy_motor_fan_blower.json")
    payload["signals"].append(copy.deepcopy(payload["signals"][0]))

    with pytest.raises(ValueError, match="duplicate signal_id"):
        load_bench_payload(payload)


def test_unknown_signal_asset_fails():
    payload = _load_fixture("healthy_motor_fan_blower.json")
    payload["signals"][0]["asset_id"] = "UNKNOWN"

    with pytest.raises(ValueError, match="unknown asset"):
        load_bench_payload(payload)


def test_unknown_edge_asset_fails():
    payload = _load_fixture("healthy_motor_fan_blower.json")
    payload["causality_edges"][0]["to_asset_id"] = "UNKNOWN"

    with pytest.raises(ValueError, match="unknown asset"):
        load_bench_payload(payload)


def test_input_payload_not_mutated():
    payload = _load_fixture("healthy_motor_fan_blower.json")
    original = deepcopy(payload)

    load_bench_payload(payload)

    assert payload == original


def test_timestamps_are_timezone_aware():
    payload = _load_fixture("healthy_motor_fan_blower.json")
    loaded = load_bench_payload(payload)

    for signal in loaded.signals:
        if signal.timestamp is not None:
            assert signal.timestamp.tzinfo is not None


def test_edge_order_preserved():
    payload = _load_fixture("healthy_motor_fan_blower.json")
    loaded = load_bench_payload(payload)
    expected_edge_ids = [edge["edge_id"] for edge in payload["causality_edges"]]
    loaded_edge_ids = [edge.edge_id for edge in loaded.causality_edges]
    assert loaded_edge_ids == expected_edge_ids


def test_unknown_quality_fails():
    payload = _load_fixture("healthy_motor_fan_blower.json")
    payload["signals"][0]["quality"] = "MAGIC"

    with pytest.raises(ValidationError):
        load_bench_payload(payload)