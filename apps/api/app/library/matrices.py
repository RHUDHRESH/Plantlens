"""Compatibility matrix generation."""

from __future__ import annotations

from typing import Any

from app.library.ports import _can_sink, _can_source, check_port_compatibility, find_port


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