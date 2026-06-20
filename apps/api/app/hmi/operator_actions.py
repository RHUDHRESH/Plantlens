"""Deterministic advisory operator actions for HMI projection."""

from app.hmi.contracts import DataQualityState, IncidentHMIState, OperatorAction, RootCauseCandidate, SafetyLevel
from app.hmi.fault_rules import (
    CAUSE_DOWNSTREAM_AIRFLOW_BLOCKAGE,
    CAUSE_MOTOR_MECHANICAL_OBSTRUCTION,
    CAUSE_SUPPLY_VOLTAGE_SAG,
)
from app.hmi.incident_builder import ROOT_ASSET_BY_CAUSE

FORBIDDEN_ACTION_PHRASES = (
    "PlantLens trips",
    "PlantLens shuts down",
    "automatically controls",
    "write to PLC",
)

DATA_QUALITY_ACTION = OperatorAction(
    priority=1,
    title="Verify sensor data quality",
    instruction=(
        "Check missing or stale sensor channels before trusting process diagnosis."
    ),
    safety_level=SafetyLevel.OBSERVE,
    target_asset_id=None,
    rationale=(
        "PlantLens did not produce a confident process root cause because required "
        "evidence is unavailable or degraded."
    ),
)

MOTOR_ACTIONS = (
    OperatorAction(
        priority=1,
        title="Stop motor safely",
        instruction=(
            "Stop the motor using the approved local control path. Do not touch rotating "
            "parts until motion has fully stopped."
        ),
        safety_level=SafetyLevel.STOP_REQUIRED,
        target_asset_id="MTR-12V",
        rationale=(
            "High current with low RPM and vibration indicates a likely mechanical "
            "obstruction or friction load."
        ),
    ),
    OperatorAction(
        priority=2,
        title="Inspect shaft, fan blade, and coupling",
        instruction=(
            "Inspect the shaft, fan blade, coupling, and nearby guards for rubbing, "
            "jamming, misalignment, or foreign objects."
        ),
        safety_level=SafetyLevel.ISOLATE_BEFORE_TOUCH,
        target_asset_id="MTR-12V",
        rationale=(
            "Mechanical blockage upstream can create downstream fan and blower symptoms."
        ),
    ),
    OperatorAction(
        priority=3,
        title="Check bearing friction and restart verification",
        instruction=(
            "After inspection, verify free rotation, then restart and confirm motor "
            "current, RPM, and vibration return to normal."
        ),
        safety_level=SafetyLevel.CAUTION,
        target_asset_id="MTR-12V",
        rationale=(
            "The diagnosis should clear only when current, RPM, and vibration normalize together."
        ),
    ),
)

SUPPLY_ACTIONS = (
    OperatorAction(
        priority=1,
        title="Verify 12V supply",
        instruction=(
            "Measure the 12V supply output under load and confirm it is within the expected range."
        ),
        safety_level=SafetyLevel.CAUTION,
        target_asset_id="PSU-12V",
        rationale="Low supply voltage can degrade the motor, fan, and blower together.",
    ),
    OperatorAction(
        priority=2,
        title="Check wiring and terminal looseness",
        instruction=(
            "Inspect supply wiring, terminals, connectors, and common return path for "
            "looseness, heating, or voltage drop."
        ),
        safety_level=SafetyLevel.ISOLATE_BEFORE_TOUCH,
        target_asset_id="PSU-12V",
        rationale=(
            "Loose or high-resistance connections can cause voltage sag under load."
        ),
    ),
    OperatorAction(
        priority=3,
        title="Check converter or supply module",
        instruction=(
            "Check the DC-DC converter or supply module rating, current limit, and thermal "
            "condition before restarting the bench."
        ),
        safety_level=SafetyLevel.CAUTION,
        target_asset_id="PSU-12V",
        rationale=(
            "A current-limited or overheated supply can create coordinated downstream degradation."
        ),
    ),
)

AIRFLOW_ACTIONS = (
    OperatorAction(
        priority=1,
        title="Inspect blower inlet and outlet",
        instruction=(
            "Inspect the blower inlet, outlet, mesh, and duct path for blockage or restriction."
        ),
        safety_level=SafetyLevel.ISOLATE_BEFORE_TOUCH,
        target_asset_id="BLW-01",
        rationale=(
            "Airflow is low while supply and motor signals remain normal, pointing downstream "
            "of the motor."
        ),
    ),
    OperatorAction(
        priority=2,
        title="Remove airflow restriction",
        instruction=(
            "Remove any mesh blockage, foreign object, duct kink, or outlet restriction, then "
            "verify airflow recovers."
        ),
        safety_level=SafetyLevel.ISOLATE_BEFORE_TOUCH,
        target_asset_id="BLW-01",
        rationale=(
            "The motor should not be disturbed when motor current and RPM are normal."
        ),
    ),
    OperatorAction(
        priority=3,
        title="Restart and verify airflow",
        instruction=(
            "Restart the airflow path and verify blower airflow returns to expected range while "
            "motor signals remain normal."
        ),
        safety_level=SafetyLevel.CAUTION,
        target_asset_id="BLW-01",
        rationale=(
            "Recovery should be confirmed at the affected airflow signal, not guessed from motor "
            "behavior."
        ),
    ),
)


def build_operator_actions(
    *,
    incident: IncidentHMIState | None,
    candidates: list[RootCauseCandidate],
    data_quality: DataQualityState,
) -> list[OperatorAction]:
    """Build advisory operator actions from incident and data-quality context."""
    if incident is None:
        if _has_degraded_data_quality(data_quality):
            return [DATA_QUALITY_ACTION]
        return []

    cause_id = incident.suspected_root_cause
    if cause_id == CAUSE_MOTOR_MECHANICAL_OBSTRUCTION:
        return list(MOTOR_ACTIONS)
    if cause_id == CAUSE_SUPPLY_VOLTAGE_SAG:
        return list(SUPPLY_ACTIONS)
    if cause_id == CAUSE_DOWNSTREAM_AIRFLOW_BLOCKAGE:
        return list(AIRFLOW_ACTIONS)

    root_asset_id = ROOT_ASSET_BY_CAUSE.get(cause_id)
    if root_asset_id is None and incident.affected_assets:
        root_asset_id = incident.affected_assets[0]

    return [
        OperatorAction(
            priority=1,
            title="Review grouped evidence",
            instruction=(
                "Review the grouped evidence and verify the root asset before taking physical action."
            ),
            safety_level=SafetyLevel.OBSERVE,
            target_asset_id=root_asset_id,
            rationale="The cause is not one of the explicit demo-bench rules.",
        )
    ]


def _has_degraded_data_quality(data_quality: DataQualityState) -> bool:
    return bool(data_quality.missing_signals or data_quality.stale_signals)