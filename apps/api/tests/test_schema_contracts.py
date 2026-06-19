"""Contract mirror tests — Pydantic models vs packages/contracts + demo bundle."""

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.schemas import (
    AlarmRule,
    AlarmRules,
    AuditRecord,
    CalmCard,
    CalmCardEvidenceItem,
    CalmCardRecommendedCheck,
    Situation,
    SituationEvidence,
    TagFrame,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
DEMO_DIR = REPO_ROOT / "packages" / "sample-data" / "demo-microgrid"
DEMO_ALARM_RULES = DEMO_DIR / "alarm_rules.json"
CONTRACTS_DIR = REPO_ROOT / "packages" / "contracts"

TS_UTC = datetime(2026, 6, 18, 12, 48, 12, tzinfo=timezone.utc)
OPERATOR_AUTHORITY = (
    "PlantLens does not trip or control equipment. "
    "It provides evidence-backed decision support."
)


def test_valid_tag_frame():
    frame = TagFrame(
        tag_id="MOTOR_301_CURRENT",
        asset_id="MTR-301",
        value=3.4,
        unit="A",
        quality="GOOD",
        timestamp=datetime(2026, 6, 18, 12, 48, 12, 100000, tzinfo=timezone.utc),
        source="simulator",
        seq=1881,
    )
    assert frame.quality == "GOOD"
    assert frame.identity_key() == (
        "simulator",
        "MOTOR_301_CURRENT",
        1881,
        frame.timestamp,
    )


def test_invalid_tag_frame_quality_rejected():
    with pytest.raises(ValidationError) as exc_info:
        TagFrame(
            tag_id="MOTOR_301_CURRENT",
            asset_id="MTR-301",
            value=1.2,
            unit="A",
            quality="INVALID",  # type: ignore[arg-type]
            timestamp=TS_UTC,
            source="simulator",
        )
    assert "quality" in str(exc_info.value)


def test_tag_frame_rejects_naive_timestamp():
    with pytest.raises(ValidationError):
        TagFrame(
            tag_id="BUS_101_V",
            asset_id="BUS-101",
            value=48.0,
            unit="V",
            quality="STALE",
            timestamp=datetime(2026, 6, 18, 12, 48, 12),  # noqa: DTZ001 — intentional naive
            source="simulator",
        )


def test_tag_frame_rejects_extra_field():
    with pytest.raises(ValidationError) as exc_info:
        TagFrame.model_validate(
            {
                "tag_id": "BUS_101_V",
                "asset_id": "BUS-101",
                "value": 48.0,
                "unit": "V",
                "quality": "GOOD",
                "timestamp": "2026-06-18T12:48:12Z",
                "source": "simulator",
                "unexpected": True,
            }
        )
    assert "unexpected" in str(exc_info.value)


def test_demo_alarm_rules_validate():
    data = json.loads(DEMO_ALARM_RULES.read_text(encoding="utf-8"))
    bundle = AlarmRules.model_validate(data)
    assert bundle.version == "1.0.0"
    assert len(bundle.rules) == 6
    severities = {rule.severity for rule in bundle.rules}
    assert severities == {"warning", "critical"}
    for rule in bundle.rules:
        AlarmRule.model_validate(rule.model_dump())


def test_alarm_rule_severity_enum():
    rule = AlarmRules.model_validate(json.loads(DEMO_ALARM_RULES.read_text(encoding="utf-8")))
    dc_bus = next(r for r in rule.rules if r.id == "DC_BUS_LOW")
    assert dc_bus.severity == "critical"
    with pytest.raises(ValidationError):
        AlarmRule.model_validate(
            {
                **dc_bus.model_dump(),
                "severity": "high",
            }
        )


def test_valid_minimal_situation():
    situation = Situation(
        situation_id="SIT_MOTOR_OVERLOAD",
        situation_type="MOTOR_MECHANICAL_OVERLOAD",
        title="Motor Mechanical Overload",
        severity="critical",
        root_asset_id="MTR-301",
        created_at=TS_UTC,
        grouped_alarm_ids=["MOTOR_CURRENT_HIGH"],
        evidence=[
            SituationEvidence(
                alarm_id="MOTOR_CURRENT_HIGH",
                asset_id="MTR-301",
                timestamp=TS_UTC,
                reason="Motor current rose first",
            )
        ],
    )
    assert situation.evidence[0].role == "evidence"
    assert situation.grouped_alarm_ids == ["MOTOR_CURRENT_HIGH"]


def test_valid_minimal_calm_card():
    card = CalmCard(
        card_id="CC_SIT_MOTOR_OVERLOAD",
        situation_id="SIT_MOTOR_OVERLOAD",
        title="Motor Mechanical Overload",
        severity="critical",
        root_asset_id="MTR-301",
        created_at=TS_UTC,
        evidence_chain=[
            CalmCardEvidenceItem(
                order=1,
                alarm_id="MOTOR_CURRENT_HIGH",
                asset_id="MTR-301",
                message="Motor current high",
                timestamp=TS_UTC,
            )
        ],
        recommended_first_check=CalmCardRecommendedCheck(
            action_id="CHECK_MOTOR_LOAD",
            label="Check mechanical load on motor branch",
            risk_level="low",
        ),
        raw_alarm_count=1,
        operator_authority=OPERATOR_AUTHORITY,
        first_signal=None,
        time_to_consequence=None,
    )
    assert card.first_signal is None
    assert card.raw_alarm_count == 1


def test_calm_card_first_signal_requires_core_fields():
    with pytest.raises(ValidationError):
        CalmCard.model_validate(
            {
                "card_id": "CC_TEST",
                "situation_id": "SIT_TEST",
                "title": "Test",
                "severity": "warning",
                "root_asset_id": "MTR-301",
                "created_at": "2026-06-18T12:48:12Z",
                "evidence_chain": [],
                "recommended_first_check": {
                    "action_id": "REVIEW",
                    "label": "Review",
                    "risk_level": "low",
                },
                "raw_alarm_count": 0,
                "operator_authority": OPERATOR_AUTHORITY,
                "first_signal": {"alarm_id": "ALARM_ONLY"},
            }
        )


def test_demo_bundle_contract_validation_script():
    result = subprocess.run(
        ["pnpm", "contracts:validate"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
        shell=sys.platform.startswith("win"),
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_demo_causal_graph_has_situation_types():
    graph = json.loads((DEMO_DIR / "causal_graph.json").read_text(encoding="utf-8"))
    situation_ids = {item["id"] for item in graph.get("situation_types", [])}
    assert "MOTOR_MECHANICAL_OVERLOAD" in situation_ids
    assert "PV_GENERATION_LOSS" in situation_ids


def test_valid_audit_record():
    record = AuditRecord(
        audit_id="01J6Z8XQ9K2M3N4P5Q6R7S8T9",
        ts=TS_UTC,
        actor_type="system",
        action="situation.created",
        entity_type="situation",
        entity_id="SIT_MOTOR_OVERLOAD",
        hash_prev="0" * 64,
        hash_self="a" * 64,
    )
    assert record.actor_type == "system"
    assert record.entity_id == "SIT_MOTOR_OVERLOAD"