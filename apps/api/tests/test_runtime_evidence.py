"""Runtime evidence packet tests."""

from __future__ import annotations

from datetime import datetime, timezone

from app.runtime.config_loader import load_runtime_config
from app.runtime.dag_runtime import diagnose_trace
from app.runtime.evidence import build_runtime_evidence_packet
from app.runtime.runtime_state import RuntimeState
from app.schemas.runtime_evidence import RuntimeEvidencePacket

REPO_ROOT = __import__("pathlib").Path(__file__).resolve().parents[3]
DEMO_DIR = REPO_ROOT / "packages" / "sample-data" / "demo-microgrid"
TS = datetime(2026, 6, 18, 12, 0, 0, tzinfo=timezone.utc)


def _motor_alarms():
    return [
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


def test_evidence_packet_builds_from_trace():
    config = load_runtime_config("demo", sample_data_dir=DEMO_DIR)
    state = RuntimeState()
    state.active_alarms = {a["alarm_id"]: a for a in _motor_alarms()}
    trace = diagnose_trace("MOTOR_CURRENT_HIGH", config.graph_index, state)
    situation = {
        "situation_id": "SIT_MOTOR_MECHANICAL_OVERLOAD",
        "situation_type": "MOTOR_MECHANICAL_OVERLOAD",
        "causal_path": ["MTR-301", "BUS-101"],
        "grouped_alarm_ids": ["MOTOR_CURRENT_HIGH", "DC_BUS_LOW"],
    }
    packet = build_runtime_evidence_packet(
        plant_id="demo",
        runtime_bundle_version="demo_microgrid_rca",
        ts=TS,
        trace=trace,
        situation=situation,
        active_alarms=_motor_alarms(),
        state_tags=state.tags,
        graph_index=config.graph_index,
        blocked_actions=[],
        recommended_checks=[{"action_id": "INSPECT", "label": "Inspect load"}],
    )
    assert isinstance(packet, RuntimeEvidencePacket)
    assert packet.root_asset_id == "MTR-301"
    assert packet.evidence_chain[0].role == "first_signal"
    assert packet.deterministic_trace_id == trace.trace_id