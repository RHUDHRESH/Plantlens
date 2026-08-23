"""Fault matrix engine unit tests."""

from __future__ import annotations

from pathlib import Path

from app.runtime.fault_matrix_engine import TagObservation, score_fault_matrix
from app.schemas.fault_matrix import FaultMatrix

REPO_ROOT = Path(__file__).resolve().parents[3]
DEMO_MATRIX = REPO_ROOT / "packages" / "sample-data" / "demo-microgrid" / "fault_matrix.json"


def _load_demo_matrix() -> FaultMatrix:
    return FaultMatrix.model_validate_json(DEMO_MATRIX.read_text(encoding="utf-8"))


def test_motor_overload_matches_hero_symptoms():
    matrix = _load_demo_matrix()
    observations = {
        "MOTOR_301_CURRENT": TagObservation(quality="GOOD", band="warning_high", trend=0.02),
        "MOTOR_301_RPM": TagObservation(quality="GOOD", band="warning_low", trend=-0.05),
        "BUS_101_V": TagObservation(quality="GOOD", band="critical_low", trend=-0.1),
        "INV_102_UNDERVOLTAGE": TagObservation(quality="GOOD", band="warning_high", value=True),
        "MOTOR_301_TEMP": TagObservation(quality="GOOD", band="normal", trend=0.05),
    }
    scored = score_fault_matrix(matrix, observations)
    assert scored
    top = next(s for s in scored if s.fault_id == "F_MOTOR_MECHANICAL_OVERLOAD")
    assert top.confidence > 0.7
    assert top.coverage >= 0.8
    assert top.contradicted is False
    assert scored[0].fault_id == "F_MOTOR_MECHANICAL_OVERLOAD"


def test_required_symptom_contradiction_vetoes_at_good_quality():
    matrix = _load_demo_matrix()
    # Required MOTOR_301_RPM expected LOW, but observed HIGH at GOOD → veto
    observations = {
        "MOTOR_301_CURRENT": TagObservation(quality="GOOD", band="warning_high", trend=0.0),
        "MOTOR_301_RPM": TagObservation(quality="GOOD", band="warning_high", trend=0.0),
        "BUS_101_V": TagObservation(quality="GOOD", band="critical_low", trend=0.0),
    }
    scored = score_fault_matrix(matrix, observations)
    overload = next(s for s in scored if s.fault_id == "F_MOTOR_MECHANICAL_OVERLOAD")
    assert overload.contradicted is True
    assert overload.confidence == 0.0
    assert any("MOTOR_301_RPM" in item for item in overload.contradicting_symptoms)


def test_suspect_quality_does_not_veto_required_contradiction():
    matrix = _load_demo_matrix()
    observations = {
        "MOTOR_301_CURRENT": TagObservation(quality="GOOD", band="warning_high"),
        # Contradiction on required RPM but only SUSPECT → no veto; kappa dilutes
        "MOTOR_301_RPM": TagObservation(quality="SUSPECT", band="warning_high"),
        "BUS_101_V": TagObservation(quality="GOOD", band="critical_low"),
    }
    scored = score_fault_matrix(matrix, observations)
    overload = next(s for s in scored if s.fault_id == "F_MOTOR_MECHANICAL_OVERLOAD")
    assert overload.contradicted is False
    assert overload.confidence > 0.0


def test_scores_sorted_by_confidence_descending():
    matrix = _load_demo_matrix()
    observations = {
        "MOTOR_301_CURRENT": TagObservation(quality="GOOD", band="warning_high"),
        "MOTOR_301_RPM": TagObservation(quality="GOOD", band="warning_low"),
        "BUS_101_V": TagObservation(quality="GOOD", band="critical_low"),
        "MOTOR_301_TEMP": TagObservation(quality="GOOD", band="critical_high"),
        "MOTOR_301_VIB": TagObservation(quality="GOOD", band="normal"),
    }
    scored = score_fault_matrix(matrix, observations)
    confidences = [s.confidence for s in scored]
    assert confidences == sorted(confidences, reverse=True)
