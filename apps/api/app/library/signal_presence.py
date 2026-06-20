"""Conservative signal presence inference for assembly observability."""

from __future__ import annotations

from collections import deque
from typing import Any

from app.library.catalog import get_component

_CAUSAL_PROBE_KINDS = frozenset({"power", "mechanical", "airflow", "fluid"})
_MONITORING_KINDS = frozenset({"signal", "mounting", "data"})


def signal_key(asset_id: str, signal_template_id: str) -> str:
    return f"{asset_id}.{signal_template_id}"


def _asset_index(assembly: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {asset["asset_id"]: asset for asset in assembly.get("assets") or []}


def _is_sensor_template(component: dict[str, Any]) -> bool:
    return component.get("category") == "sensors"


def _signal_templates_by_id(component: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {s["signal_template_id"]: s for s in component.get("signal_templates") or []}


def _quantity_kinds_for_sensor(component: dict[str, Any]) -> set[str]:
    kinds: set[str] = set()
    for signal in component.get("signal_templates") or []:
        kinds.add(signal["quantity_kind"])
    for port in component.get("ports") or []:
        kinds.add(port.get("quantity_kind", ""))
    kinds.discard("")
    return kinds


def _neighbors_for_signal_probe(
    asset_id: str,
    assembly: dict[str, Any],
) -> list[str]:
    """Return asset ids reachable via non-monitoring approved connections."""
    assets = _asset_index(assembly)
    neighbors: list[str] = []
    for connection in assembly.get("connections") or []:
        if not connection.get("approved", False):
            continue
        kind = connection.get("connection_kind", "")
        if kind in _MONITORING_KINDS:
            continue
        if kind not in _CAUSAL_PROBE_KINDS:
            continue
        if connection["from_asset_id"] == asset_id:
            neighbors.append(connection["to_asset_id"])
        elif connection["to_asset_id"] == asset_id:
            neighbors.append(connection["from_asset_id"])
    return neighbors


def _sensors_measuring_quantity(
    assembly: dict[str, Any],
    library: dict[str, Any],
    quantity_kind: str,
) -> list[tuple[str, dict[str, Any]]]:
    sensors: list[tuple[str, dict[str, Any]]] = []
    for asset in assembly.get("assets") or []:
        component = get_component(asset["component_type_id"])
        if component is None or not _is_sensor_template(component):
            continue
        if quantity_kind in _quantity_kinds_for_sensor(component):
            sensors.append((asset["asset_id"], component))
    return sensors


def asset_has_signal(
    asset: dict[str, Any],
    component: dict[str, Any],
    signal_template_id: str,
    assembly: dict[str, Any],
    library: dict[str, Any],
) -> bool:
    """Return whether a signal is observably present for an asset instance."""
    if signal_template_id in (asset.get("configured_signals") or []):
        return True

    signals = _signal_templates_by_id(component)
    signal = signals.get(signal_template_id)
    if signal is None:
        return False

    disabled = (asset.get("overrides") or {}).get("disabled_signals") or []
    if signal_template_id in disabled:
        return False

    quantity_kind = signal["quantity_kind"]
    asset_id = asset["asset_id"]

    # Direct sensor on same asset (sensor components expose their own templates).
    if _is_sensor_template(component):
        return signal_template_id in signals

    # BFS: sensor connected within two hops on physical/monitoring probe edges.
    visited: set[str] = {asset_id}
    queue: deque[tuple[str, int]] = deque([(asset_id, 0)])
    while queue:
        current_id, depth = queue.popleft()
        if depth >= 3:
            continue
        for neighbor_id in _neighbors_for_signal_probe(current_id, assembly):
            if neighbor_id in visited:
                continue
            visited.add(neighbor_id)
            neighbor_asset = _asset_index(assembly).get(neighbor_id)
            if neighbor_asset is None:
                continue
            neighbor_component = get_component(neighbor_asset["component_type_id"])
            if neighbor_component is None:
                continue
            if _is_sensor_template(neighbor_component):
                if quantity_kind in _quantity_kinds_for_sensor(neighbor_component):
                    return True
            queue.append((neighbor_id, depth + 1))

    # Conservative fallback: template exists on component but no sensor path found.
    return False


def build_asset_signal_presence(
    assembly: dict[str, Any],
    library: dict[str, Any],
) -> dict[str, set[str]]:
    """Map asset_id -> set of present signal_template_ids."""
    presence: dict[str, set[str]] = {}
    for asset in sorted(assembly.get("assets") or [], key=lambda a: a["asset_id"]):
        component = get_component(asset["component_type_id"])
        if component is None:
            presence[asset["asset_id"]] = set()
            continue
        present: set[str] = set()
        for signal in component.get("signal_templates") or []:
            sid = signal["signal_template_id"]
            if asset_has_signal(asset, component, sid, assembly, library):
                present.add(sid)
        presence[asset["asset_id"]] = present
    return presence


def list_sensor_templates(library: dict[str, Any]) -> list[dict[str, Any]]:
    return sorted(
        [c for c in library.get("components") or [] if _is_sensor_template(c)],
        key=lambda c: c["component_type_id"],
    )