"""Plant assembly validation."""

from __future__ import annotations

from typing import Any

from app.library.catalog import get_component
from app.library.ports import check_port_compatibility, find_port


def _asset_index(assembly: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {asset["asset_id"]: asset for asset in assembly.get("assets") or []}


def _validation_error(
    code: str,
    message: str,
    *,
    path: str,
    fix: str,
) -> dict[str, str]:
    return {"code": code, "message": message, "path": path, "fix": fix}


def validate_asset_instance(asset: dict[str, Any], library: dict[str, Any]) -> list[dict[str, str]]:
    errors: list[dict[str, str]] = []
    component_type_id = asset.get("component_type_id")
    component = get_component(component_type_id) if component_type_id else None
    if component is None:
        errors.append(_validation_error(
            "UNKNOWN_COMPONENT_TYPE",
            f"Unknown component_type_id: {component_type_id}",
            path=f"assets[{asset.get('asset_id', '?')}]",
            fix="Use a component_type_id from GET /api/library/components.",
        ))
        return errors

    if not asset.get("asset_id"):
        errors.append(_validation_error(
            "MISSING_ASSET_ID",
            "Asset instance requires asset_id.",
            path="assets[]",
            fix="Assign a unique asset_id to each placed component.",
        ))

    for port_id in asset.get("configured_ports") or []:
        if find_port(component, port_id) is None:
            errors.append(_validation_error(
                "UNKNOWN_PORT_ID",
                f"configured_ports references unknown port '{port_id}' on {component_type_id}",
                path=f"assets[{asset.get('asset_id')}]",
                fix="Use port IDs declared on the component template.",
            ))
    return errors


def validate_plant_connection(
    connection: dict[str, Any],
    assembly: dict[str, Any],
    library: dict[str, Any],
) -> list[dict[str, str]]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    assets = _asset_index(assembly)
    conn_id = connection.get("connection_id", "?")
    path = f"connections[{conn_id}]"

    from_asset_id = connection.get("from_asset_id")
    to_asset_id = connection.get("to_asset_id")
    from_port_id = connection.get("from_port_id")
    to_port_id = connection.get("to_port_id")

    from_asset = assets.get(from_asset_id or "")
    to_asset = assets.get(to_asset_id or "")
    if from_asset is None:
        errors.append(_validation_error(
            "UNKNOWN_ASSET",
            f"from_asset_id '{from_asset_id}' not found in assembly.",
            path=path,
            fix="Connect only between placed asset instances.",
        ))
        return errors
    if to_asset is None:
        errors.append(_validation_error(
            "UNKNOWN_ASSET",
            f"to_asset_id '{to_asset_id}' not found in assembly.",
            path=path,
            fix="Connect only between placed asset instances.",
        ))
        return errors

    if from_asset_id == to_asset_id and from_port_id == to_port_id:
        errors.append(_validation_error(
            "SELF_LOOP",
            "from and to port cannot be identical on the same asset.",
            path=path,
            fix="Connect distinct ports on the same asset or use separate assets.",
        ))

    from_component = get_component(from_asset["component_type_id"])
    to_component = get_component(to_asset["component_type_id"])
    if from_component is None or to_component is None:
        return errors

    from_port = find_port(from_component, from_port_id or "")
    to_port = find_port(to_component, to_port_id or "")
    if from_port is None:
        errors.append(_validation_error(
            "UNKNOWN_PORT_ID",
            f"from_port_id '{from_port_id}' not found on {from_asset['component_type_id']}",
            path=path,
            fix="Use a valid output port on the source component template.",
        ))
        return errors
    if to_port is None:
        errors.append(_validation_error(
            "UNKNOWN_PORT_ID",
            f"to_port_id '{to_port_id}' not found on {to_asset['component_type_id']}",
            path=path,
            fix="Use a valid input port on the target component template.",
        ))
        return errors

    lag_min = connection.get("lag_min_ms", 0)
    lag_max = connection.get("lag_max_ms", 0)
    if lag_min > lag_max:
        errors.append(_validation_error(
            "INVALID_LAG",
            "lag_min_ms must be <= lag_max_ms.",
            path=path,
            fix="Set non-negative lag bounds with min <= max.",
        ))

    if connection.get("approved", False):
        result = check_port_compatibility(from_component, from_port, to_component, to_port)
        if not result.compatible:
            errors.append(_validation_error(
                "INCOMPATIBLE_PORTS",
                result.reason,
                path=path,
                fix=_fix_hint(from_port, to_port, result.reason),
            ))
        elif result.warnings:
            warnings.append(_validation_error(
                "COMPATIBILITY_WARNING",
                "; ".join(result.warnings),
                path=path,
                fix="Review adapter requirements before approving the connection.",
            ))

    return errors


def _fix_hint(from_port: dict[str, Any], to_port: dict[str, Any], reason: str) -> str:
    if from_port["medium"] != to_port["medium"]:
        if from_port["medium"] == "analog_signal":
            return "Connect analog sensor output to PLC analog input, not process airflow or power ports."
        if from_port["medium"] == "dc_power":
            return "Connect DC power output to a DC power input on a load or converter."
    return "Select ports with matching medium, direction, and compatible quantity kind."


def validate_plant_assembly(assembly: dict[str, Any], library: dict[str, Any]) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []

    asset_ids = [a.get("asset_id") for a in assembly.get("assets") or []]
    if len(asset_ids) != len(set(asset_ids)):
        errors.append(_validation_error(
            "DUPLICATE_ASSET_ID",
            "Duplicate asset_id detected in assembly.",
            path="assets",
            fix="Ensure every asset_id is unique.",
        ))

    conn_ids = [c.get("connection_id") for c in assembly.get("connections") or []]
    if len(conn_ids) != len(set(conn_ids)):
        errors.append(_validation_error(
            "DUPLICATE_CONNECTION_ID",
            "Duplicate connection_id detected in assembly.",
            path="connections",
            fix="Assign unique connection_id values.",
        ))

    for asset in assembly.get("assets") or []:
        errors.extend(validate_asset_instance(asset, library))

    for index, connection in enumerate(assembly.get("connections") or []):
        conn_errors = validate_plant_connection(connection, assembly, library)
        for err in conn_errors:
            if err["code"] == "COMPATIBILITY_WARNING":
                warnings.append({**err, "path": f"connections[{index}]"})
            else:
                errors.append({**err, "path": f"connections[{index}]"})

    status = "error" if errors else "ok"
    return {
        "status": status,
        "errors": errors,
        "warnings": warnings,
        "compatibility_report": create_compatibility_report(assembly, library),
    }


def create_compatibility_report(assembly: dict[str, Any], library: dict[str, Any]) -> dict[str, Any]:
    assets = _asset_index(assembly)
    connection_reports: list[dict[str, Any]] = []

    for connection in assembly.get("connections") or []:
        from_asset = assets.get(connection.get("from_asset_id", ""))
        to_asset = assets.get(connection.get("to_asset_id", ""))
        if from_asset is None or to_asset is None:
            connection_reports.append({
                "connection_id": connection.get("connection_id"),
                "compatible": False,
                "reason": "Missing asset reference.",
            })
            continue

        from_component = get_component(from_asset["component_type_id"])
        to_component = get_component(to_asset["component_type_id"])
        if from_component is None or to_component is None:
            connection_reports.append({
                "connection_id": connection.get("connection_id"),
                "compatible": False,
                "reason": "Unknown component template.",
            })
            continue

        from_port = find_port(from_component, connection.get("from_port_id", ""))
        to_port = find_port(to_component, connection.get("to_port_id", ""))
        if from_port is None or to_port is None:
            connection_reports.append({
                "connection_id": connection.get("connection_id"),
                "compatible": False,
                "reason": "Unknown port reference.",
            })
            continue

        result = check_port_compatibility(from_component, from_port, to_component, to_port)
        connection_reports.append({
            "connection_id": connection.get("connection_id"),
            "from_asset_id": connection.get("from_asset_id"),
            "from_port_id": connection.get("from_port_id"),
            "to_asset_id": connection.get("to_asset_id"),
            "to_port_id": connection.get("to_port_id"),
            "approved": connection.get("approved", False),
            "compatible": result.compatible,
            "severity": result.severity,
            "reason": result.reason,
            "warnings": result.warnings,
            "required_adapters": result.required_adapters,
        })

    approved = [r for r in connection_reports if r.get("approved")]
    compatible_approved = [r for r in approved if r.get("compatible")]
    return {
        "assets_count": len(assembly.get("assets") or []),
        "connections_count": len(assembly.get("connections") or []),
        "approved_connections_count": len(approved),
        "compatible_approved_count": len(compatible_approved),
        "connections": connection_reports,
    }