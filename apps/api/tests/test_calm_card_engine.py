"""Calm Card engine unit tests."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from app.runtime.calm_card_engine import (
    OPERATOR_AUTHORITY,
    build_calm_card_from_evidence,
    find_blocked_actions,
    select_recommended_action,
)
from app.runtime.config_loader import load_runtime_config
from app.runtime.dag_runtime import diagnose_trace
from app.runtime.evidence import build_runtime_evidence_packet
from app.runtime.runtime_state import RuntimeState

REPO_ROOT = Path(__file__).resolve().parents[3]
DEMO_DIR = REPO_ROOT / "packages" / "sample-data" / "demo-microgrid"
TS = datetime(2026, 6, 18, 12, 0, 0, tzinfo=timezone.utc)


def _motor_packet():
    config = load_runtime_config("demo", sample_data_dir=DEMO_DIR)
    state = RuntimeState()
    alarms = [
        {
            "alarm_id": "MOTOR_CURRENT_HIGH",
            "asset_id": "MTR-301",
            "tag_id": "MOTOR_301_CURRENT",
            "raised_at": "2026-06-18T12:00:02Z",
            "severity": "warning",
            "message": "Motor current high",
            "value": 3.4,
        },
        {
            "alarm_id": "DC_BUS_LOW",
            "asset_id": "BUS-101",
            "tag_id": "BUS_101_V",
            "raised_at": "2026-06-18T12:00:06Z",
            "severity": "critical",
            "message": "DC bus low",
            "value": 40.5,
        },
    ]
    state.active_alarms = {a["alarm_id"]: a for a in alarms}
    trace = diagnose_trace("MOTOR_CURRENT_HIGH", config.graph_index, state)
    situation = {
        "situation_id": "SIT_MOTOR_MECHANICAL_OVERLOAD",
        "situation_type": "MOTOR_MECHANICAL_OVERLOAD",
        "causal_path": ["MTR-301", "BUS-101"],
        "grouped_alarm_ids": ["MOTOR_CURRENT_HIGH", "DC_BUS_LOW"],
    }
    spec = next(
        s for s in config.graph_index["situation_types"] if s["id"] == "MOTOR_MECHANICAL_OVERLOAD"
    )
    blocked = find_blocked_actions(
        "MOTOR_MECHANICAL_OVERLOAD",
        set(situation["grouped_alarm_ids"]),
        config.action_envelope,
    )
    recommended = select_recommended_action("MOTOR_MECHANICAL_OVERLOAD", config.action_envelope)
    packet = build_runtime_evidence_packet(
        plant_id="demo",
        runtime_bundle_version="demo_microgrid_rca",
        ts=TS,
        trace=trace,
        situation=situation,
        active_alarms=alarms,
        state_tags=state.tags,
        graph_index=config.graph_index,
        blocked_actions=blocked,
        recommended_checks=[recommended],
    )
    return packet, config, spec


def test_calm_card_contains_root_asset():
    packet, config, spec = _motor_packet()
    card = build_calm_card_from_evidence(
        packet,
        config.action_envelope,
        situation_spec=spec,
        severity="warning",
    )
    assert card["root_asset_id"] == "MTR-301"


def test_calm_card_shows_first_signal():
    packet, config, spec = _motor_packet()
    card = build_calm_card_from_evidence(packet, config.action_envelope, situation_spec=spec)
    assert card["first_signal"] is not None
    assert card["first_signal"]["alarm_id"] == "MOTOR_CURRENT_HIGH"


def test_calm_card_shows_raw_alarm_count():
    packet, config, spec = _motor_packet()
    card = build_calm_card_from_evidence(packet, config.action_envelope, situation_spec=spec)
    assert card["raw_alarm_count"] == 2
    assert "MOTOR_CURRENT_HIGH" in card["raw_alarm_ids"]


def test_calm_card_shows_blocked_actions_when_configured():
    packet, config, spec = _motor_packet()
    card = build_calm_card_from_evidence(packet, config.action_envelope, situation_spec=spec)
    assert isinstance(card["blocked_actions"], list)


def test_calm_card_action_within_envelope():
    packet, config, spec = _motor_packet()
    card = build_calm_card_from_evidence(packet, config.action_envelope, situation_spec=spec)
    action_id = card["recommended_first_check"]["action_id"]
    allowed = {action["id"] for action in config.action_envelope.get("actions", [])}
    allowed.add("REVIEW_RAW_ALARMS")
    assert action_id in allowed


def test_calm_card_includes_operator_disclaimer():
    packet, config, spec = _motor_packet()
    card = build_calm_card_from_evidence(packet, config.action_envelope, situation_spec=spec)
    assert card["operator_authority"] == OPERATOR_AUTHORITY
    assert "does not trip" in OPERATOR_AUTHORITY.lower()