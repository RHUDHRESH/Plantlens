"""Asset status precedence tests."""

from __future__ import annotations

from datetime import datetime, timezone

from app.runtime.asset_status import STATUS_PRECEDENCE, derive_asset_status

TS = datetime(2026, 6, 18, 12, 0, 0, tzinfo=timezone.utc)
ASSET_INDEX = {
    "MTR-301": {"id": "MTR-301"},
    "BUS-101": {"id": "BUS-101"},
}


class _Frame:
    def __init__(self, asset_id: str, quality: str = "GOOD") -> None:
        self.asset_id = asset_id
        self.quality = quality


def test_precedence_critical_over_sensor_bad():
    assert STATUS_PRECEDENCE["critical"] > STATUS_PRECEDENCE["sensor_bad"]
    assert STATUS_PRECEDENCE["warning"] > STATUS_PRECEDENCE["sensor_bad"]
    assert STATUS_PRECEDENCE["sensor_bad"] > STATUS_PRECEDENCE["offline"]


def test_critical_alarm_wins_over_stale_tag():
    tags = {"MOTOR_301_CURRENT": _Frame("MTR-301", "STALE")}
    alarms = {
        "MOTOR_CURRENT_HIGH": {
            "alarm_id": "MOTOR_CURRENT_HIGH",
            "asset_id": "MTR-301",
            "severity": "critical",
        }
    }
    statuses = derive_asset_status(ASSET_INDEX, alarms, {}, tags, TS)
    assert statuses["MTR-301"] == "critical"


def test_sensor_bad_without_process_alarm():
    tags = {"MOTOR_301_CURRENT": _Frame("MTR-301", "STALE")}
    statuses = derive_asset_status(ASSET_INDEX, {}, {}, tags, TS)
    assert statuses["MTR-301"] == "sensor_bad"