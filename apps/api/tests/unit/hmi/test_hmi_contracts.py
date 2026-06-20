"""Unit tests for HMI projection layer Pydantic contracts."""

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.hmi.contracts import (
    AssetHMIState,
    DataQualityState,
    ExpectedRange,
    HMIAssetStatus,
    HMIOverallStatus,
    PlantHMIState,
    RootCauseCandidate,
)

GENERATED_AT = datetime(2026, 6, 20, 12, 0, 0, tzinfo=UTC)


def test_plant_hmi_state_serializes_cleanly():
    state = PlantHMIState(
        plant_id="PLANTLENS_DEMO_BENCH",
        run_id="run_healthy_001",
        generated_at=GENERATED_AT,
        overall_status=HMIOverallStatus.HEALTHY,
        active_incident=None,
        data_quality=DataQualityState(),
    )
    dumped = state.model_dump(mode="json")

    assert dumped["generated_at"] == "2026-06-20T12:00:00Z"
    assert dumped["active_incident"] is None
    assert dumped["overall_status"] == "healthy"


def test_invalid_enum_rejected():
    with pytest.raises(ValidationError):
        PlantHMIState(
            plant_id="PLANTLENS_DEMO_BENCH",
            run_id="run_healthy_001",
            generated_at=GENERATED_AT,
            overall_status="exploded",  # type: ignore[arg-type]
            data_quality=DataQualityState(),
        )


def test_extra_fields_forbidden():
    with pytest.raises(ValidationError):
        PlantHMIState(
            plant_id="PLANTLENS_DEMO_BENCH",
            run_id="run_healthy_001",
            generated_at=GENERATED_AT,
            overall_status=HMIOverallStatus.HEALTHY,
            data_quality=DataQualityState(),
            surprise_field="nope",  # type: ignore[call-arg]
        )


def test_confidence_bounds_enforced():
    with pytest.raises(ValidationError):
        RootCauseCandidate(
            cause_id="cause_001",
            title="Motor overload",
            asset_id="MTR-12V",
            confidence=1.5,
        )


def test_health_score_bounds_enforced():
    with pytest.raises(ValidationError):
        AssetHMIState(
            asset_id="MTR-12V",
            name="12V DC Motor",
            kind="motor",
            status=HMIAssetStatus.HEALTHY,
            health_score=101,
        )


def test_expected_range_rejects_min_greater_than_max():
    with pytest.raises(ValidationError):
        ExpectedRange(min=10, max=5)