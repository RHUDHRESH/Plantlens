"""Agent roster draft stubs — evidence required, HITL approval always."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

AGENTS_ROOT = Path(__file__).resolve().parents[3] / "apps" / "agents"
sys.path.insert(0, str(AGENTS_ROOT))

from agents.registry import run_agent  # noqa: E402


def _evidence() -> dict:
    return {
        "evidence_id": "EV_ROSTER_001",
        "root_asset_id": "MTR-301",
        "situation_type": "MOTOR_MECHANICAL_OVERLOAD",
        "confidence": 0.8,
        "deterministic_trace_id": "TRACE_R1",
        "active_alarm_ids": ["MOTOR_CURRENT_HIGH"],
        "stale_or_bad_tags": ["VIB_X"],
        "missing_tags": [],
        "recommended_checks": ["Inspect coupling"],
        "evidence_chain": [
            {
                "asset_id": "MTR-301",
                "alarm_id": "MOTOR_CURRENT_HIGH",
                "role": "first_signal",
                "first_seen_ts": "2026-01-01T10:00:00Z",
                "explanation": "Current high",
            }
        ],
        "causal_path": [],
    }


@pytest.mark.parametrize(
    "name,artifact",
    [
        ("maintenance_planner", "work_order_draft"),
        ("scenario_author", "scenario_draft"),
        ("data_quality", "data_quality_report"),
        ("change_review", "change_review_draft"),
        ("tag_mapper", "tag_map_draft"),
        ("hmi_narrator", "hmi_narration"),
    ],
)
def test_roster_agents_return_draft_with_evidence(name: str, artifact: str):
    result = run_agent(name, {"context": {"evidence_packet": _evidence()}})
    assert result["artifact_type"] == artifact
    assert result["requires_human_approval"] is True
    assert result.get("validation_status") == "pending" or artifact == "hmi_narration"


@pytest.mark.parametrize(
    "name",
    [
        "maintenance_planner",
        "scenario_author",
        "data_quality",
        "change_review",
        "tag_mapper",
        "hmi_narrator",
    ],
)
def test_roster_agents_unavailable_without_evidence(name: str):
    result = run_agent(name, {"context": {}})
    assert result["artifact_type"] == "service_unavailable"
    assert result["proposed_changes"] == []
    assert result["requires_human_approval"] is True


def test_roster_refuses_forbidden_tools():
    with pytest.raises(PermissionError, match="forbidden tool"):
        run_agent(
            "maintenance_planner",
            {"tools": ["write_modbus"], "context": {"evidence_packet": _evidence()}},
        )
