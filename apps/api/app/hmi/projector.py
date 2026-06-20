"""Deterministic HMI projector — canonical bench payload to PlantHMIState."""

from copy import deepcopy
from datetime import UTC, datetime
from typing import Any

from app.hmi.bench_adapter import BenchPayload, load_bench_payload
from app.hmi.contracts import (
    AssetHMIState,
    CausalityEdgeHMI,
    DataQualityState,
    HMIOverallStatus,
    HMISeverity,
    IncidentHMIState,
    PlantHMIState,
)
from app.hmi.fault_rules import classify_bench_faults
from app.hmi.incident_builder import (
    build_alarm_groups,
    build_asset_states,
    build_hmi_incident,
    build_suppressed_symptoms,
)
from app.hmi.operator_actions import build_operator_actions
from app.hmi.status import build_data_quality, evaluate_signals
from app.schemas.ingest.gates import GateReport


class HMIProjectionError(ValueError):
    """Raised when HMI projection cannot proceed due to invalid projection input."""


def build_hmi_state(
    canonical_payload: dict,
    gate_results: list | dict | None = None,
    now: datetime | None = None,
) -> PlantHMIState:
    """Project one frontend-ready PlantHMIState from a canonical bench payload."""
    generated_at = _resolve_generated_at(now)
    payload_copy = deepcopy(canonical_payload)

    blocked, gate_notes = _has_blocking_gate_result(gate_results)
    if blocked:
        return _build_blocked_state(payload_copy, generated_at=generated_at, gate_notes=gate_notes)

    bench = load_bench_payload(payload_copy)
    signal_states = evaluate_signals(bench.signals, now=generated_at)
    data_quality = build_data_quality(signal_states)
    candidates = classify_bench_faults(signal_states, data_quality)
    incident = build_hmi_incident(
        bench=bench,
        signals=signal_states,
        candidates=candidates,
        data_quality=data_quality,
        now=generated_at,
    )
    suppressed = build_suppressed_symptoms(incident=incident, signals=signal_states)
    alarm_groups = build_alarm_groups(
        incident=incident,
        signals=signal_states,
        candidates=candidates,
    )
    assets = build_asset_states(
        bench=bench,
        signals=signal_states,
        incident=incident,
        suppressed_symptoms=suppressed,
        data_quality=data_quality,
    )
    actions = build_operator_actions(
        incident=incident,
        candidates=candidates,
        data_quality=data_quality,
    )
    causality_edges = _build_causality_edges(bench, incident)
    overall_status = derive_overall_status(
        incident=incident,
        assets=assets,
        data_quality=data_quality,
    )

    return PlantHMIState(
        plant_id=bench.plant_id,
        run_id=bench.run_id,
        generated_at=generated_at,
        overall_status=overall_status,
        active_incident=incident,
        assets=assets,
        signals=signal_states,
        causality_edges=causality_edges,
        root_cause_candidates=candidates,
        operator_actions=actions,
        alarm_groups=alarm_groups,
        suppressed_symptoms=suppressed,
        data_quality=data_quality,
    )


def derive_overall_status(
    *,
    incident: IncidentHMIState | None,
    assets: list[AssetHMIState],
    data_quality: DataQualityState,
) -> HMIOverallStatus:
    """Derive plant-wide HMI status from incident, assets, and data quality."""
    from app.hmi.contracts import HMIAssetStatus

    if any(asset.status == HMIAssetStatus.OFFLINE for asset in assets):
        return HMIOverallStatus.OFFLINE

    if incident is not None and incident.severity == HMISeverity.CRITICAL:
        return HMIOverallStatus.FAULT

    if any(asset.status == HMIAssetStatus.FAULT for asset in assets):
        return HMIOverallStatus.FAULT

    if incident is not None and incident.severity == HMISeverity.WARNING:
        return HMIOverallStatus.WARNING

    if data_quality.confidence_penalty > 0:
        return HMIOverallStatus.WARNING

    if any(asset.status == HMIAssetStatus.WARNING for asset in assets):
        return HMIOverallStatus.WARNING

    return HMIOverallStatus.HEALTHY


def _resolve_generated_at(now: datetime | None) -> datetime:
    if now is None:
        return datetime.now(UTC)
    if now.tzinfo is None:
        return now.replace(tzinfo=UTC)
    return now


def _normalize_gate_results(gate_results: list | dict | None) -> list[Any]:
    if gate_results is None:
        return []
    if isinstance(gate_results, dict):
        return [gate_results]
    return list(gate_results)


def _gate_report_fields(report: Any) -> tuple[str, str, list[Any]]:
    if isinstance(report, GateReport):
        gate_name = report.gate_name
        verdict = report.verdict
        issues = report.issues
        return gate_name, verdict, issues

    if isinstance(report, dict):
        gate_name = str(report.get("gate_name", "unknown"))
        verdict = str(report.get("verdict", ""))
        issues = report.get("issues", []) or []
        return gate_name, verdict, issues

    gate_name = str(getattr(report, "gate_name", "unknown"))
    verdict = str(getattr(report, "verdict", ""))
    issues = getattr(report, "issues", []) or []
    return gate_name, verdict, issues


def _issue_fields(issue: Any) -> tuple[str, str]:
    if isinstance(issue, dict):
        return str(issue.get("code", "UNKNOWN")), str(issue.get("severity", ""))
    return str(getattr(issue, "code", "UNKNOWN")), str(getattr(issue, "severity", ""))


def _has_blocking_gate_result(
    gate_results: list | dict | None,
) -> tuple[bool, list[str]]:
    notes: list[str] = []
    blocked = False

    for report in _normalize_gate_results(gate_results):
        gate_name, verdict, issues = _gate_report_fields(report)
        if verdict == "fail":
            blocked = True
            notes.append(f"Gate {gate_name} failed; HMI projection blocked.")

        for issue in issues:
            code, severity = _issue_fields(issue)
            if severity == "BLOCKER":
                blocked = True
                notes.append(
                    f"Gate {gate_name} emitted BLOCKER issue {code}; HMI projection blocked."
                )

    return blocked, notes


def _build_blocked_state(
    payload: dict,
    *,
    generated_at: datetime,
    gate_notes: list[str],
) -> PlantHMIState:
    return PlantHMIState(
        plant_id=str(payload.get("plant_id", "UNKNOWN_PLANT")),
        run_id=str(payload.get("run_id", "UNKNOWN_RUN")),
        generated_at=generated_at,
        overall_status=HMIOverallStatus.BLOCKED,
        active_incident=None,
        assets=[],
        signals=[],
        causality_edges=[],
        root_cause_candidates=[],
        operator_actions=[],
        alarm_groups=[],
        suppressed_symptoms=[],
        data_quality=DataQualityState(
            missing_signals=[],
            stale_signals=[],
            confidence_penalty=1.0,
            notes=gate_notes,
        ),
    )


def _build_causality_edges(
    bench: BenchPayload,
    incident: IncidentHMIState | None,
) -> list[CausalityEdgeHMI]:
    affected_assets = set(incident.affected_assets) if incident is not None else set()
    edges: list[CausalityEdgeHMI] = []

    for edge in bench.causality_edges:
        active = (
            incident is not None
            and edge.from_asset_id in affected_assets
            and edge.to_asset_id in affected_assets
        )
        edges.append(
            CausalityEdgeHMI(
                edge_id=edge.edge_id,
                from_asset_id=edge.from_asset_id,
                to_asset_id=edge.to_asset_id,
                relation=edge.relation,
                active=active,
            )
        )

    return edges