"""Bench-rig bundle: real physical hardware model + live-only diagnosis contract.

These tests pin the *product default* plant (bench_rig_001). They guard:
  - the bundle loads and matches the real bench inventory,
  - every asset carries an explicit verification_status (no fake certainty),
  - with NO live data the engine invents NO faults,
  - a live frame drives the deterministic DAG to the correct root situation,
  - a grid fault never blames the motor.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest

from app.runtime.config_loader import load_runtime_config
from app.runtime.runtime_state import RuntimeState
from app.runtime.runtime_tick import evaluate_runtime_tick, on_tag_frame
from app.schemas.tag_frame import TagFrame

REPO_ROOT = Path(__file__).resolve().parents[3]
BENCH_DIR = REPO_ROOT / "packages" / "sample-data" / "bench-rig"

EXPECTED_ASSETS = {
    "PV-SRC", "ISO-PV", "M1", "DCDC", "DCBUS", "GRID", "SW-GRID", "M2",
    "BAT", "ISO-BAT", "INV", "M4", "VFD", "CT-MOTOR", "MOTOR",
}
VALID_VERIFICATION = {
    "USER_STATED", "DATASHEET_PENDING", "UNKNOWN",
    "INFERRED_NEEDS_VERIFICATION", "PHOTO_PENDING", "DATASHEET_CONFIRMED",
}


@pytest.fixture
def config():
    return load_runtime_config("bench_rig_001", sample_data_dir=BENCH_DIR)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def test_bundle_models_real_bench_inventory(config):
    assert config.plant_id == "bench_rig_001"
    assert set(config.asset_index) == EXPECTED_ASSETS


def test_every_asset_has_explicit_verification_status(config):
    """No fake certainty: each asset declares how trustworthy its specs are."""
    missing = [
        aid for aid, a in config.asset_index.items()
        if a.get("meta", {}).get("verification_status") not in VALID_VERIFICATION
    ]
    assert missing == [], f"assets missing/invalid verification_status: {missing}"


def test_unknown_hardware_is_modeled_as_unknown_not_invented(config):
    """DC-DC converter and inverter ratings are genuinely unknown — say so."""
    assert config.asset_index["DCDC"]["meta"]["verification_status"] == "UNKNOWN"
    assert config.asset_index["INV"]["meta"]["verification_status"] == "UNKNOWN"


def test_no_live_data_invents_no_faults(config):
    """The core live-only contract: empty snapshot => zero alarms, zero situations."""
    result = evaluate_runtime_tick(RuntimeState(), config, now=_now())
    assert result["active_alarms"] == []
    assert result["situations"] == []
    assert result["calm_card"] is None


def test_live_motor_overcurrent_drives_dag_to_motor_root(config):
    state = RuntimeState()
    frame = TagFrame(
        tag_id="MOTOR_I", asset_id="MOTOR", value=3.2, unit="A",
        quality="GOOD", timestamp=_now(), source="modbus_rtu",
    )
    result = on_tag_frame(state, frame, config)
    assert "MOTOR_CURRENT_HIGH" in {a["alarm_id"] for a in result["active_alarms"]}
    types = {s.get("situation_type") for s in result["situations"]}
    assert "MOTOR_OVERLOAD" in types
    assert result["calm_card"] is not None


def test_grid_undervoltage_roots_at_grid_not_motor(config):
    state = RuntimeState()
    frame = TagFrame(
        tag_id="M2_GRID_V", asset_id="M2", value=180.0, unit="V",
        quality="GOOD", timestamp=_now(), source="modbus_rtu",
    )
    result = on_tag_frame(state, frame, config)
    grid_situation = next(
        (s for s in result["situations"] if s.get("situation_type") == "GRID_UNDERVOLTAGE"),
        None,
    )
    assert grid_situation is not None
    assert grid_situation["root_asset_id"] == "GRID"


def test_non_good_quality_carries_no_process_value(config):
    """A stale/bad reading must never inject a number into the runtime seam."""
    state = RuntimeState()
    frame = TagFrame(
        tag_id="M4_INV_V", asset_id="M4", value=235.0, unit="V",
        quality="STALE", timestamp=_now(), source="modbus_rtu",
    )
    on_tag_frame(state, frame, config)
    stored = state.get_tag("M4_INV_V")
    assert stored is not None
    assert stored.value is None
