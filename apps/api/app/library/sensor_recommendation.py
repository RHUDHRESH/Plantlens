"""Greedy deterministic sensor recommendation for fault observability."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from app.library.catalog import get_component
from app.library.matrices import build_fault_signature_matrix, build_observability_matrix
from app.library.signal_presence import (
    asset_has_signal,
    build_asset_signal_presence,
    list_sensor_templates,
)


def _fault_index(fault_signature_matrix: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {f["fault_key"]: f for f in fault_signature_matrix.get("faults") or []}


def _observability_index(observability_matrix: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {f["fault_key"]: f for f in observability_matrix.get("fault_observability") or []}


def _assembly_coverage(observability_matrix: dict[str, Any]) -> float:
    rows = observability_matrix.get("fault_observability") or []
    if not rows:
        return 0.0
    return sum(r.get("coverage_score", 0.0) for r in rows) / len(rows)


def _severity_multiplier(severity: str) -> float:
    return {"critical": 1.5, "high": 1.3, "warning": 1.0, "info": 0.8}.get(severity, 1.0)


def _missing_evidence_by_quantity(
    fault_signature_matrix: dict[str, Any],
    observability_matrix: dict[str, Any],
) -> dict[str, list[tuple[str, str, bool, float]]]:
    """quantity_kind -> list of (fault_key, signal_template_id, required, weight)."""
    faults = _fault_index(fault_signature_matrix)
    obs = _observability_index(observability_matrix)
    missing: dict[str, list[tuple[str, str, bool, float]]] = {}

    for fault_key, fault in faults.items():
        row = obs.get(fault_key, {})
        for signal_id in row.get("missing_required_signals") or []:
            for rule in fault.get("required_evidence") or []:
                if rule["signal_template_id"] == signal_id:
                    component = get_component(fault["component_type_id"])
                    if component is None:
                        continue
                    signal = next(
                        (s for s in component.get("signal_templates") or [] if s["signal_template_id"] == signal_id),
                        None,
                    )
                    if signal is None:
                        continue
                    missing.setdefault(signal["quantity_kind"], []).append(
                        (fault_key, signal_id, True, float(rule.get("weight", 0.5))),
                    )
        for signal_id in row.get("missing_optional_signals") or []:
            for rule in fault.get("optional_evidence") or []:
                if rule["signal_template_id"] == signal_id:
                    component = get_component(fault["component_type_id"])
                    if component is None:
                        continue
                    signal = next(
                        (s for s in component.get("signal_templates") or [] if s["signal_template_id"] == signal_id),
                        None,
                    )
                    if signal is None:
                        continue
                    missing.setdefault(signal["quantity_kind"], []).append(
                        (fault_key, signal_id, False, float(rule.get("weight", 0.5)) * 0.6),
                    )
    return missing


def _sensor_already_present(
    sensor_type_id: str,
    assembly: dict[str, Any],
) -> bool:
    return any(a["component_type_id"] == sensor_type_id for a in assembly.get("assets") or [])


def _simulate_sensor_addition(
    assembly: dict[str, Any],
    library: dict[str, Any],
    sensor_type_id: str,
    quantity_kind: str,
) -> dict[str, Any]:
    """Return assembly copy with a virtual sensor asset for coverage simulation."""
    simulated = deepcopy(assembly)
    sensor_id = f"__recommended_{sensor_type_id}"
    simulated["assets"].append({
        "asset_id": sensor_id,
        "component_type_id": sensor_type_id,
        "display_name": f"Recommended {sensor_type_id}",
        "position_2d": {"x": 0, "y": 0},
        "configured_ports": [],
        "configured_signals": [],
        "overrides": {},
        "enabled_fault_modes": [],
    })
    # Connect recommended sensor to every asset missing this quantity (conservative gain).
    for asset in assembly.get("assets") or []:
        component = get_component(asset["component_type_id"])
        if component is None:
            continue
        for signal in component.get("signal_templates") or []:
            if signal["quantity_kind"] == quantity_kind:
                if not asset_has_signal(asset, component, signal["signal_template_id"], assembly, library):
                    simulated["connections"].append({
                        "connection_id": f"__rec_{sensor_id}_{asset['asset_id']}",
                        "from_asset_id": asset["asset_id"],
                        "from_port_id": "sense_out",
                        "to_asset_id": sensor_id,
                        "to_port_id": "mount_sense",
                        "connection_kind": "mounting",
                        "approved": True,
                        "lag_min_ms": 0,
                        "lag_max_ms": 50,
                        "notes": "Virtual recommendation edge",
                    })
                    # Also mark signal as configured for coverage simulation.
                    for sim_asset in simulated["assets"]:
                        if sim_asset["asset_id"] == asset["asset_id"]:
                            sim_asset.setdefault("configured_signals", [])
                            if signal["signal_template_id"] not in sim_asset["configured_signals"]:
                                sim_asset["configured_signals"].append(signal["signal_template_id"])
    return simulated


def recommend_sensors(
    component_library: dict[str, Any],
    plant_assembly: dict[str, Any],
    fault_signature_matrix: dict[str, Any],
    observability_matrix: dict[str, Any],
    budget_limit: float | None = None,
    max_recommendations: int = 8,
    coverage_threshold: float = 0.85,
) -> dict[str, Any]:
    missing_by_qty = _missing_evidence_by_quantity(fault_signature_matrix, observability_matrix)
    faults = _fault_index(fault_signature_matrix)
    coverage_before = _assembly_coverage(observability_matrix)
    recommended: list[dict[str, Any]] = []
    working_assembly = deepcopy(plant_assembly)
    working_obs = observability_matrix

    sensor_templates = list_sensor_templates(component_library)
    quantity_to_sensors: dict[str, list[dict[str, Any]]] = {}
    for sensor in sensor_templates:
        for signal in sensor.get("signal_templates") or []:
            quantity_to_sensors.setdefault(signal["quantity_kind"], []).append(sensor)

    picked_types: set[str] = set()

    while len(recommended) < max_recommendations:
        current_coverage = _assembly_coverage(working_obs)
        if current_coverage >= coverage_threshold:
            break

        best: dict[str, Any] | None = None
        best_gain = 0.0

        for quantity_kind in sorted(missing_by_qty.keys()):
            entries = missing_by_qty[quantity_kind]
            if not entries:
                continue
            candidates = quantity_to_sensors.get(quantity_kind, [])
            for sensor in sorted(candidates, key=lambda s: s["component_type_id"]):
                sensor_type_id = sensor["component_type_id"]
                if sensor_type_id in picked_types:
                    continue
                already = _sensor_already_present(sensor_type_id, plant_assembly)
                base_gain = sum(
                    weight * _severity_multiplier(faults[fk].get("severity", "warning"))
                    for fk, _sid, required, weight in entries
                    if fk in faults
                )
                if already:
                    base_gain *= 0.15
                if base_gain <= best_gain:
                    continue

                simulated = _simulate_sensor_addition(working_assembly, component_library, sensor_type_id, quantity_kind)
                sim_f = build_fault_signature_matrix(component_library, simulated)
                sim_o = build_observability_matrix(component_library, simulated, sim_f)
                after_coverage = _assembly_coverage(sim_o)
                marginal_gain = after_coverage - current_coverage
                if marginal_gain <= 0:
                    continue

                faults_improved = sorted({
                    fk for fk, sid, _req, _w in entries if fk in faults
                })
                evidence_covered = sorted({sid for _fk, sid, _req, _w in entries})

                placement = ""
                for rec in sensor.get("recommended_sensors") or []:
                    if rec.get("measured_quantity") == quantity_kind:
                        placement = rec.get("placement_hint", "")
                        break
                if not placement:
                    placement = f"Install {sensor['display_name']} to measure {quantity_kind}."

                candidate = {
                    "component_type_id": sensor_type_id,
                    "measured_quantity": quantity_kind,
                    "placement_hint": placement,
                    "marginal_gain": round(marginal_gain, 4),
                    "faults_improved": faults_improved,
                    "required_evidence_covered": evidence_covered,
                    "confidence_improvement": {
                        "before": round(current_coverage, 2),
                        "after": round(after_coverage, 2),
                    },
                }
                if marginal_gain > best_gain:
                    best_gain = marginal_gain
                    best = candidate

        if best is None or best_gain <= 0:
            break

        recommended.append(best)
        picked_types.add(best["component_type_id"])
        working_assembly = _simulate_sensor_addition(
            working_assembly,
            component_library,
            best["component_type_id"],
            best["measured_quantity"],
        )
        sim_f = build_fault_signature_matrix(component_library, working_assembly)
        working_obs = build_observability_matrix(component_library, working_assembly, sim_f)

        if budget_limit is not None and len(recommended) >= int(budget_limit):
            break

    coverage_after = _assembly_coverage(working_obs)
    all_fault_keys = sorted(f["fault_key"] for f in fault_signature_matrix.get("faults") or [])
    covered = sorted({
        fk
        for rec in recommended
        for fk in rec.get("faults_improved") or []
    })
    not_covered = [fk for fk in all_fault_keys if fk not in covered]

    return {
        "recommended_sensors": recommended,
        "faults_covered": covered,
        "faults_not_covered": not_covered,
        "coverage_before": round(coverage_before, 2),
        "coverage_after": round(coverage_after, 2),
    }