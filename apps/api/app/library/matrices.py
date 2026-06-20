"""Compatibility, fault signature, observability, and causal propagation matrices."""

from __future__ import annotations

from collections import deque
from typing import Any

from app.library.catalog import get_component
from app.library.ports import _can_sink, _can_source, check_port_compatibility, find_port
from app.library.signal_presence import (
    asset_has_signal,
    build_asset_signal_presence,
    list_sensor_templates,
    signal_key,
)


def _sorted_components(library: dict[str, Any]) -> list[dict[str, Any]]:
    return sorted(library.get("components") or [], key=lambda c: c["component_type_id"])


def _edge_key(
    from_type: str,
    from_port: str,
    to_type: str,
    to_port: str,
) -> tuple[str, str, str, str]:
    return (from_type, from_port, to_type, to_port)


def build_compatibility_matrix(library: dict[str, Any]) -> dict[str, Any]:
    """Build full deterministic compatibility matrix across all template port pairs."""
    components = _sorted_components(library)
    compatible_edges: list[dict[str, Any]] = []
    rejected_edges: list[dict[str, Any]] = []
    ports_count = 0

    for component in components:
        ports_count += len(component.get("ports") or [])

    for from_component in components:
        from_type = from_component["component_type_id"]
        for from_port in sorted(from_component.get("ports") or [], key=lambda p: p["port_id"]):
            if not _can_source(from_port):
                continue
            for to_component in components:
                to_type = to_component["component_type_id"]
                for to_port in sorted(to_component.get("ports") or [], key=lambda p: p["port_id"]):
                    if not _can_sink(to_port):
                        continue
                    result = check_port_compatibility(from_component, from_port, to_component, to_port)
                    edge = {
                        "from_component_type_id": from_type,
                        "from_port_id": from_port["port_id"],
                        "to_component_type_id": to_type,
                        "to_port_id": to_port["port_id"],
                        "compatible": result.compatible,
                        "severity": result.severity,
                        "reason": result.reason,
                        "warnings": result.warnings,
                        "required_adapters": result.required_adapters,
                    }
                    if result.compatible:
                        compatible_edges.append(edge)
                    else:
                        rejected_edges.append(edge)

    compatible_edges.sort(key=lambda e: _edge_key(
        e["from_component_type_id"], e["from_port_id"], e["to_component_type_id"], e["to_port_id"]
    ))
    rejected_edges.sort(key=lambda e: _edge_key(
        e["from_component_type_id"], e["from_port_id"], e["to_component_type_id"], e["to_port_id"]
    ))

    return {
        "components_count": len(components),
        "ports_count": ports_count,
        "compatible_edges": compatible_edges,
        "rejected_edges": rejected_edges,
        "compatible_edges_count": len(compatible_edges),
        "rejected_edges_count": len(rejected_edges),
    }


def summarize_compatibility_matrix(matrix: dict[str, Any], *, sample_size: int = 12) -> dict[str, Any]:
    compatible = matrix["compatible_edges"]
    rejected = matrix["rejected_edges"]
    return {
        "components_count": matrix["components_count"],
        "ports_count": matrix["ports_count"],
        "compatible_edges_count": matrix["compatible_edges_count"],
        "rejected_edges_count": matrix["rejected_edges_count"],
        "compatible_edges_sample": compatible[:sample_size],
        "rejected_edges_sample": rejected[:sample_size],
    }


def lookup_template_edge(
    library: dict[str, Any],
    from_component_type_id: str,
    from_port_id: str,
    to_component_type_id: str,
    to_port_id: str,
) -> dict[str, Any] | None:
    from_component = next(
        (c for c in library.get("components", []) if c["component_type_id"] == from_component_type_id),
        None,
    )
    to_component = next(
        (c for c in library.get("components", []) if c["component_type_id"] == to_component_type_id),
        None,
    )
    if from_component is None or to_component is None:
        return None
    from_port = find_port(from_component, from_port_id)
    to_port = find_port(to_component, to_port_id)
    if from_port is None or to_port is None:
        return None
    result = check_port_compatibility(from_component, from_port, to_component, to_port)
    return {
        "from_component_type_id": from_component_type_id,
        "from_port_id": from_port_id,
        "to_component_type_id": to_component_type_id,
        "to_port_id": to_port_id,
        "compatible": result.compatible,
        "severity": result.severity,
        "reason": result.reason,
        "warnings": result.warnings,
        "required_adapters": result.required_adapters,
        "from_medium": result.from_medium,
        "to_medium": result.to_medium,
        "from_quantity_kind": result.from_quantity_kind,
        "to_quantity_kind": result.to_quantity_kind,
    }


# ---------------------------------------------------------------------------
# Fault Signature Matrix (F)
# ---------------------------------------------------------------------------

def _enabled_fault_modes(asset: dict[str, Any], component: dict[str, Any]) -> list[dict[str, Any]]:
    enabled_ids = asset.get("enabled_fault_modes") or []
    all_modes = component.get("fault_modes") or []
    if not enabled_ids:
        return list(all_modes)
    enabled_set = set(enabled_ids)
    return [mode for mode in all_modes if mode["fault_mode_id"] in enabled_set]


def _signal_templates_by_id(component: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {s["signal_template_id"]: s for s in component.get("signal_templates") or []}


def _build_signature_entries(
    asset: dict[str, Any],
    component: dict[str, Any],
    evidence_rules: list[dict[str, Any]],
    *,
    source: str,
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    signatures: list[dict[str, Any]] = []
    warnings: list[dict[str, str]] = []
    templates = _signal_templates_by_id(component)
    asset_id = asset["asset_id"]

    for rule in evidence_rules:
        signal_template_id = rule["signal_template_id"]
        if signal_template_id not in templates:
            warnings.append({
                "code": "UNKNOWN_FAULT_SIGNAL_REFERENCE",
                "message": (
                    f"Fault evidence references unknown signal '{signal_template_id}' "
                    f"on {component['component_type_id']}"
                ),
                "path": f"assets[{asset_id}]/fault/evidence",
                "fix": "Update component fault mode evidence or add signal template.",
            })
            continue
        signatures.append({
            "signal_key": signal_key(asset_id, signal_template_id),
            "signal_template_id": signal_template_id,
            "relation": rule.get("relation", "inconsistent"),
            "weight": float(rule.get("weight", 0.5)),
            "required": bool(rule.get("required", source == "required_evidence")),
            "source": source,
        })

    signatures.sort(key=lambda s: s["signal_template_id"])
    return signatures, warnings


def get_fault_signature_for_asset(
    asset_instance: dict[str, Any],
    component_template: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    """Build fault signature rows for one asset instance."""
    faults: list[dict[str, Any]] = []
    warnings: list[dict[str, str]] = []
    asset_id = asset_instance["asset_id"]
    component_type_id = component_template["component_type_id"]

    for fault_mode in sorted(
        _enabled_fault_modes(asset_instance, component_template),
        key=lambda m: m["fault_mode_id"],
    ):
        fault_mode_id = fault_mode["fault_mode_id"]
        required_sig, req_warn = _build_signature_entries(
            asset_instance,
            component_template,
            fault_mode.get("required_evidence") or [],
            source="required_evidence",
        )
        optional_sig, opt_warn = _build_signature_entries(
            asset_instance,
            component_template,
            fault_mode.get("optional_evidence") or [],
            source="optional_evidence",
        )
        warnings.extend(req_warn)
        warnings.extend(opt_warn)
        signature = required_sig + optional_sig
        signature.sort(key=lambda s: (s["signal_template_id"], s["source"]))

        total_required_weight = sum(s["weight"] for s in signature if s["required"])
        total_optional_weight = sum(s["weight"] for s in signature if not s["required"])

        faults.append({
            "fault_key": f"{asset_id}.{fault_mode_id}",
            "asset_id": asset_id,
            "component_type_id": component_type_id,
            "fault_mode_id": fault_mode_id,
            "title": fault_mode.get("title", fault_mode_id),
            "severity": fault_mode.get("severity", "warning"),
            "required_evidence": fault_mode.get("required_evidence") or [],
            "optional_evidence": fault_mode.get("optional_evidence") or [],
            "signature": signature,
            "total_required_weight": round(total_required_weight, 4),
            "total_optional_weight": round(total_optional_weight, 4),
            "operator_actions": fault_mode.get("operator_actions") or [],
            "rejected_alternatives": fault_mode.get("rejected_alternatives") or [],
            "downstream_effects": fault_mode.get("downstream_effects") or [],
        })

    faults.sort(key=lambda f: (f["asset_id"], f["fault_mode_id"]))
    return faults, warnings


def build_fault_signature_matrix(
    component_library: dict[str, Any],
    plant_assembly: dict[str, Any],
) -> dict[str, Any]:
    faults: list[dict[str, Any]] = []
    warnings: list[dict[str, str]] = []

    for asset in sorted(plant_assembly.get("assets") or [], key=lambda a: a["asset_id"]):
        component = get_component(asset["component_type_id"])
        if component is None:
            continue
        asset_faults, asset_warnings = get_fault_signature_for_asset(asset, component)
        faults.extend(asset_faults)
        warnings.extend(asset_warnings)

    faults.sort(key=lambda f: (f["asset_id"], f["fault_mode_id"]))
    return {
        "assembly_id": plant_assembly.get("assembly_id", ""),
        "faults": faults,
        "warnings": warnings,
    }


# ---------------------------------------------------------------------------
# Observability Matrix (O)
# ---------------------------------------------------------------------------

_SEVERITY_MULTIPLIER = {"critical": 1.5, "high": 1.3, "warning": 1.0, "info": 0.8}


def _coverage_ratio(present: set[str], rules: list[dict[str, Any]]) -> float:
    if not rules:
        return 0.0
    total_weight = sum(float(r.get("weight", 0.5)) for r in rules)
    if total_weight <= 0:
        return 0.0
    matched = sum(
        float(r.get("weight", 0.5))
        for r in rules
        if r["signal_template_id"] in present
    )
    return matched / total_weight


def _confidence_ceiling(
    required_coverage: float,
    optional_coverage: float,
    *,
    has_downstream: bool,
) -> float:
    if required_coverage >= 1.0:
        return 0.95
    if required_coverage >= 0.7:
        return 0.80
    if required_coverage > 0.0:
        return 0.60
    if optional_coverage > 0.0:
        return 0.45
    if has_downstream:
        return 0.35
    return 0.10


def _observability_class(
    required_coverage: float,
    optional_coverage: float,
    *,
    has_downstream: bool,
) -> str:
    if required_coverage >= 0.7:
        return "observable"
    if required_coverage > 0.0 or optional_coverage > 0.0 or has_downstream:
        return "weakly_observable"
    return "unobservable"


def _recommend_sensors_for_fault(
    missing_required: list[str],
    missing_optional: list[str],
    component: dict[str, Any],
    library: dict[str, Any],
) -> list[dict[str, str]]:
    recommendations: list[dict[str, str]] = []
    templates = _signal_templates_by_id(component)
    missing = missing_required + missing_optional
    sensor_templates = list_sensor_templates(library)

    for signal_template_id in missing:
        signal = templates.get(signal_template_id)
        if signal is None:
            continue
        quantity_kind = signal["quantity_kind"]
        for sensor in sensor_templates:
            for rec in sensor.get("recommended_sensors") or []:
                if rec.get("measured_quantity") == quantity_kind:
                    recommendations.append({
                        "sensor_type": sensor["component_type_id"],
                        "measured_quantity": quantity_kind,
                        "placement_hint": rec.get("placement_hint", ""),
                        "reason": rec.get("reason", f"Improves {signal_template_id} observability."),
                    })
                    break
            else:
                sensor_signals = sensor.get("signal_templates") or []
                if any(s["quantity_kind"] == quantity_kind for s in sensor_signals):
                    recommendations.append({
                        "sensor_type": sensor["component_type_id"],
                        "measured_quantity": quantity_kind,
                        "placement_hint": f"Mount {sensor['display_name']} on {component['display_name']}.",
                        "reason": f"Provides {quantity_kind} measurement for {signal_template_id}.",
                    })
    # Deduplicate deterministically
    seen: set[tuple[str, str]] = set()
    unique: list[dict[str, str]] = []
    for rec in sorted(recommendations, key=lambda r: (r["sensor_type"], r["measured_quantity"])):
        key = (rec["sensor_type"], rec["measured_quantity"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(rec)
    return unique[:4]


def build_observability_matrix(
    component_library: dict[str, Any],
    plant_assembly: dict[str, Any],
    fault_signature_matrix: dict[str, Any],
) -> dict[str, Any]:
    presence = build_asset_signal_presence(plant_assembly, component_library)
    fault_observability: list[dict[str, Any]] = []

    for fault in fault_signature_matrix.get("faults") or []:
        asset_id = fault["asset_id"]
        present = presence.get(asset_id, set())
        component = get_component(fault["component_type_id"])
        if component is None:
            continue

        required_rules = fault.get("required_evidence") or []
        optional_rules = fault.get("optional_evidence") or []
        required_present = [r["signal_template_id"] for r in required_rules if r["signal_template_id"] in present]
        required_missing = [r["signal_template_id"] for r in required_rules if r["signal_template_id"] not in present]
        optional_present = [r["signal_template_id"] for r in optional_rules if r["signal_template_id"] in present]
        optional_missing = [r["signal_template_id"] for r in optional_rules if r["signal_template_id"] not in present]

        required_coverage = _coverage_ratio(present, required_rules)
        optional_coverage = _coverage_ratio(present, optional_rules)
        has_downstream = bool(fault.get("downstream_effects"))
        obs_class = _observability_class(required_coverage, optional_coverage, has_downstream=has_downstream)
        ceiling = _confidence_ceiling(required_coverage, optional_coverage, has_downstream=has_downstream)

        if obs_class == "observable":
            explanation = (
                f"{fault['title']} is observable because required evidence signals are present."
            )
        elif obs_class == "weakly_observable":
            missing = ", ".join(required_missing) or ", ".join(optional_missing) or "downstream only"
            explanation = f"Weakly observable: missing {missing}."
        else:
            explanation = f"Unobservable: no required or optional evidence available for {fault['title']}."

        fault_observability.append({
            "fault_key": fault["fault_key"],
            "observable": obs_class == "observable",
            "observability_class": obs_class,
            "confidence_ceiling": round(ceiling, 2),
            "coverage_score": round(required_coverage, 2),
            "required_signals_present": sorted(required_present),
            "missing_required_signals": sorted(required_missing),
            "optional_signals_present": sorted(optional_present),
            "missing_optional_signals": sorted(optional_missing),
            "recommended_sensors": _recommend_sensors_for_fault(
                required_missing,
                optional_missing,
                component,
                component_library,
            ),
            "explanation": explanation,
        })

    fault_observability.sort(key=lambda f: f["fault_key"])
    observable_count = sum(1 for f in fault_observability if f["observability_class"] == "observable")
    weak_count = sum(1 for f in fault_observability if f["observability_class"] == "weakly_observable")
    unobservable_count = sum(1 for f in fault_observability if f["observability_class"] == "unobservable")
    avg_ceiling = (
        sum(f["confidence_ceiling"] for f in fault_observability) / len(fault_observability)
        if fault_observability else 0.0
    )

    return {
        "assembly_id": plant_assembly.get("assembly_id", ""),
        "fault_observability": fault_observability,
        "summary": {
            "total_faults": len(fault_observability),
            "observable_faults": observable_count,
            "weakly_observable_faults": weak_count,
            "unobservable_faults": unobservable_count,
            "average_confidence_ceiling": round(avg_ceiling, 2),
        },
    }


# ---------------------------------------------------------------------------
# Causal Propagation Matrix (P)
# ---------------------------------------------------------------------------

_CAUSAL_EDGE_KINDS = frozenset({"power", "mechanical", "airflow", "fluid"})
_NON_CAUSAL_KINDS = frozenset({"signal", "mounting", "data", "non_causal_visual", "monitoring_only"})


def _is_causal_connection(connection: dict[str, Any]) -> bool:
    if not connection.get("approved", False):
        return False
    kind = connection.get("connection_kind", "")
    if kind in _NON_CAUSAL_KINDS:
        return False
    return kind in _CAUSAL_EDGE_KINDS


def _detect_cycles(adjacency: dict[str, list[str]]) -> list[list[str]]:
    cycles: list[list[str]] = []
    visited: set[str] = set()
    stack: list[str] = []
    in_stack: set[str] = set()

    def dfs(node: str) -> None:
        visited.add(node)
        in_stack.add(node)
        stack.append(node)
        for neighbor in adjacency.get(node, []):
            if neighbor not in visited:
                dfs(neighbor)
            elif neighbor in in_stack:
                idx = stack.index(neighbor)
                cycles.append(stack[idx:] + [neighbor])
        stack.pop()
        in_stack.remove(node)

    for node in sorted(adjacency.keys()):
        if node not in visited:
            dfs(node)
    return cycles


def _topological_order(adjacency: dict[str, list[str]], nodes: list[str]) -> list[str]:
    indegree: dict[str, int] = {n: 0 for n in nodes}
    for src, targets in adjacency.items():
        for tgt in targets:
            indegree[tgt] = indegree.get(tgt, 0) + 1
    queue = deque(sorted(n for n in nodes if indegree.get(n, 0) == 0))
    order: list[str] = []
    while queue:
        node = queue.popleft()
        order.append(node)
        for neighbor in sorted(adjacency.get(node, [])):
            indegree[neighbor] -= 1
            if indegree[neighbor] == 0:
                queue.append(neighbor)
    if len(order) != len(nodes):
        return sorted(nodes)
    return order


def build_causal_propagation_matrix(
    component_library: dict[str, Any],
    plant_assembly: dict[str, Any],
) -> dict[str, Any]:
    assets = [a["asset_id"] for a in plant_assembly.get("assets") or []]
    adjacency: dict[str, list[str]] = {a: [] for a in assets}
    reverse_adjacency: dict[str, list[str]] = {a: [] for a in assets}
    monitoring_excluded = 0
    unapproved_excluded = 0
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []

    for index, connection in enumerate(plant_assembly.get("connections") or []):
        if not connection.get("approved", False):
            unapproved_excluded += 1
            continue
        kind = connection.get("connection_kind", "")
        if kind in _NON_CAUSAL_KINDS or kind not in _CAUSAL_EDGE_KINDS:
            monitoring_excluded += 1
            continue
        src = connection["from_asset_id"]
        tgt = connection["to_asset_id"]
        if src not in adjacency or tgt not in adjacency:
            continue
        adjacency[src].append(tgt)
        reverse_adjacency[tgt].append(src)

    for node in adjacency:
        adjacency[node] = sorted(set(adjacency[node]))
        reverse_adjacency[node] = sorted(set(reverse_adjacency[node]))

    cycles = _detect_cycles(adjacency)
    if cycles:
        cycle_path = " -> ".join(cycles[0])
        errors.append({
            "code": "CAUSAL_CYCLE_DETECTED",
            "message": f"Causal cycle detected: {cycle_path}",
            "path": "connections",
            "fix": "Mark monitoring edges as non-causal or remove feedback edge.",
        })

    topological_order = _topological_order(adjacency, assets)
    active_paths: list[dict[str, Any]] = []

    def enumerate_paths(start: str, end: str) -> list[list[str]]:
        paths: list[list[str]] = []
        stack: list[tuple[str, list[str]]] = [(start, [start])]
        while stack:
            node, path = stack.pop()
            for neighbor in adjacency.get(node, []):
                if neighbor in path:
                    continue
                new_path = path + [neighbor]
                if neighbor == end:
                    paths.append(new_path)
                else:
                    stack.append((neighbor, new_path))
        return paths

    for src in sorted(adjacency.keys()):
        for tgt in sorted(adjacency[src]):
            for path in enumerate_paths(src, tgt):
                lag_min = 0
                lag_max = 0
                media: list[str] = []
                for i in range(len(path) - 1):
                    for connection in plant_assembly.get("connections") or []:
                        if (
                            connection.get("approved")
                            and connection["from_asset_id"] == path[i]
                            and connection["to_asset_id"] == path[i + 1]
                            and _is_causal_connection(connection)
                        ):
                            media.append(connection.get("connection_kind", ""))
                            lag_min += int(connection.get("lag_min_ms", 0))
                            lag_max += int(connection.get("lag_max_ms", 0))
                            break
                active_paths.append({
                    "from_asset_id": src,
                    "to_asset_id": tgt,
                    "path": path,
                    "medium_chain": media,
                    "lag_min_ms": lag_min,
                    "lag_max_ms": lag_max,
                })

    active_paths.sort(key=lambda p: (p["from_asset_id"], p["to_asset_id"], tuple(p["path"])))

    return {
        "assembly_id": plant_assembly.get("assembly_id", ""),
        "adjacency": adjacency,
        "reverse_adjacency": reverse_adjacency,
        "topological_order": topological_order,
        "active_propagation_paths": active_paths,
        "monitoring_edges_excluded_count": monitoring_excluded,
        "unapproved_edges_excluded_count": unapproved_excluded,
        "warnings": warnings,
        "errors": errors,
    }