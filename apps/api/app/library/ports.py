"""Deterministic port compatibility checks."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

Severity = Literal["ok", "warning", "error"]

MOUNTING_MEDIUM = "mounting"
SAFETY_MEDIA = frozenset({"dc_power", "ac_power", "fluid_flow"})

ANALOG_GENERIC_QUANTITIES = frozenset({"data", "voltage", "current", "pressure", "temperature", "vibration", "airflow", "rpm"})
DIGITAL_GENERIC_QUANTITIES = frozenset({"boolean_state", "rpm", "data"})


@dataclass
class CompatibilityResult:
    compatible: bool
    severity: Severity
    reason: str
    warnings: list[str] = field(default_factory=list)
    required_adapters: list[str] = field(default_factory=list)
    from_medium: str = ""
    to_medium: str = ""
    from_quantity_kind: str = ""
    to_quantity_kind: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def find_port(component: dict[str, Any], port_id: str) -> dict[str, Any] | None:
    for port in component.get("ports") or []:
        if port["port_id"] == port_id:
            return port
    return None


def _can_source(port: dict[str, Any]) -> bool:
    return port["direction"] in {"output", "bidirectional"}


def _can_sink(port: dict[str, Any]) -> bool:
    return port["direction"] in {"input", "bidirectional"}


def _nominal_bounds(port: dict[str, Any]) -> tuple[float | None, float | None]:
    nominal = port.get("nominal_range") or {}
    return nominal.get("min"), nominal.get("max")


def _ranges_overlap(
    from_min: float | None,
    from_max: float | None,
    to_min: float | None,
    to_max: float | None,
) -> tuple[bool, bool]:
    """Return (overlaps, both_defined)."""
    from_vals = [v for v in (from_min, from_max) if v is not None]
    to_vals = [v for v in (to_min, to_max) if v is not None]
    if not from_vals or not to_vals:
        return True, False
    f_lo = from_min if from_min is not None else from_max
    f_hi = from_max if from_max is not None else from_min
    t_lo = to_min if to_min is not None else to_max
    t_hi = to_max if to_max is not None else to_min
    if f_lo is None or f_hi is None or t_lo is None or t_hi is None:
        return True, False
    return f_lo <= t_hi and t_lo <= f_hi, True


def _tag_overlap(from_tags: list[str], to_tags: list[str]) -> bool:
    if not from_tags or not to_tags:
        return True
    return bool(set(from_tags) & set(to_tags))


def _check_direction(from_port: dict[str, Any], to_port: dict[str, Any]) -> CompatibilityResult | None:
    from_medium = from_port["medium"]
    to_medium = to_port["medium"]
    base = {
        "from_medium": from_medium,
        "to_medium": to_medium,
        "from_quantity_kind": from_port["quantity_kind"],
        "to_quantity_kind": to_port["quantity_kind"],
    }

    if not _can_source(from_port):
        return CompatibilityResult(
            compatible=False,
            severity="error",
            reason=f"Source port '{from_port['port_id']}' direction '{from_port['direction']}' cannot drive a connection.",
            **base,
        )
    if not _can_sink(to_port):
        return CompatibilityResult(
            compatible=False,
            severity="error",
            reason=f"Target port '{to_port['port_id']}' direction '{to_port['direction']}' cannot receive a connection.",
            **base,
        )

    if from_port["direction"] == "output" and to_port["direction"] == "output":
        if from_medium == MOUNTING_MEDIUM and to_medium == MOUNTING_MEDIUM:
            return None
        return CompatibilityResult(
            compatible=False,
            severity="error",
            reason="Output-to-output connections are invalid for process and power ports.",
            **base,
        )

    if from_port["direction"] == "input" and to_port["direction"] == "input":
        return CompatibilityResult(
            compatible=False,
            severity="error",
            reason="Input-to-input connections are invalid; connect an output to an input.",
            **base,
        )
    return None


def _medium_compatible(from_medium: str, to_medium: str) -> bool:
    if from_medium == to_medium:
        return True
    return False


def _quantity_compatible(
    from_medium: str,
    from_q: str,
    to_q: str,
    warnings: list[str],
    adapters: list[str],
) -> bool:
    if from_q == to_q:
        return True

    if from_medium == "analog_signal":
        if to_q in ANALOG_GENERIC_QUANTITIES or from_q in ANALOG_GENERIC_QUANTITIES:
            if to_q == "data" or from_q in {"voltage", "current", "pressure", "temperature", "vibration", "airflow"}:
                warnings.append(f"Quantity kind {from_q} -> {to_q} via analog channel; verify scaling in PLC tag map.")
                return True
        return False

    if from_medium == "digital_signal":
        if from_q in DIGITAL_GENERIC_QUANTITIES and to_q in DIGITAL_GENERIC_QUANTITIES:
            if from_q != to_q:
                warnings.append(f"Digital quantity mapping {from_q} -> {to_q}; confirm input module supports pulse/boolean mode.")
            return True
        return False

    if from_medium == "mechanical_rotation":
        return from_q == "rpm" and to_q == "rpm"

    if from_medium == "dc_power":
        return from_q in {"voltage", "current"} and to_q in {"voltage", "current"}

    if from_medium == "airflow":
        return from_q == "airflow" and to_q == "airflow"

    if from_medium == "fluid_flow":
        return from_q in {"data", "pressure"} and to_q in {"data", "pressure"}

    if from_medium == "thermal":
        return from_q == "temperature" and to_q == "temperature"

    if from_medium == MOUNTING_MEDIUM:
        return from_q in {"physical_mount", "vibration"} and to_q in {"physical_mount", "vibration"}

    if from_medium in {"serial_comm", "ethernet"}:
        return from_q == "data" and to_q == "data"

    return False


def check_port_compatibility(
    from_component: dict[str, Any],
    from_port: dict[str, Any],
    to_component: dict[str, Any],
    to_port: dict[str, Any],
) -> CompatibilityResult:
    """Deterministic port-pair compatibility evaluation."""
    warnings: list[str] = []
    adapters: list[str] = []
    base = {
        "from_medium": from_port["medium"],
        "to_medium": to_port["medium"],
        "from_quantity_kind": from_port["quantity_kind"],
        "to_quantity_kind": to_port["quantity_kind"],
    }

    direction_error = _check_direction(from_port, to_port)
    if direction_error is not None:
        return direction_error

    from_medium = from_port["medium"]
    to_medium = to_port["medium"]

    if not _medium_compatible(from_medium, to_medium):
        return CompatibilityResult(
            compatible=False,
            severity="error",
            reason=(
                f"Incompatible media: {from_medium} cannot connect to {to_medium}. "
                f"Example: analog sensor output cannot drive an airflow inlet."
            ),
            **base,
        )

    if not _quantity_compatible(from_medium, from_port["quantity_kind"], to_port["quantity_kind"], warnings, adapters):
        return CompatibilityResult(
            compatible=False,
            severity="error",
            reason=(
                f"Incompatible quantity kinds: {from_port['quantity_kind']} -> {to_port['quantity_kind']} "
                f"on medium {from_medium}."
            ),
            warnings=warnings,
            **base,
        )

    from_tags = from_port.get("compatibility_tags") or []
    to_tags = to_port.get("compatibility_tags") or []
    generic_medium = from_medium in {"analog_signal", "digital_signal", "ethernet", "serial_comm", "data"}
    if not generic_medium and not _tag_overlap(from_tags, to_tags):
        if from_tags and to_tags:
            adapters.append("interface_adapter")
            warnings.append(
                f"Compatibility tag mismatch ({from_tags} vs {to_tags}); adapter or coupling may be required."
            )
        elif from_medium == "mechanical_rotation" and (from_tags or to_tags):
            return CompatibilityResult(
                compatible=False,
                severity="error",
                reason="Mechanical shaft connection requires overlapping compatibility tags.",
                warnings=warnings,
                required_adapters=adapters,
                **base,
            )

    f_min, f_max = _nominal_bounds(from_port)
    t_min, t_max = _nominal_bounds(to_port)
    overlaps, both_defined = _ranges_overlap(f_min, f_max, t_min, t_max)
    if both_defined and not overlaps:
        if from_medium in SAFETY_MEDIA:
            return CompatibilityResult(
                compatible=False,
                severity="error",
                reason="Nominal operating ranges do not overlap; connection is electrically or physically impossible.",
                warnings=warnings,
                **base,
            )
        adapters.append("range_adapter")
        warnings.append("Nominal ranges do not fully overlap; verify ratings before approving connection.")

    if from_medium == "dc_power" and both_defined and overlaps:
        if f_max is not None and t_max is not None and f_max < t_min:
            return CompatibilityResult(
                compatible=False,
                severity="error",
                reason="Supply voltage range cannot satisfy load input requirement.",
                **base,
            )
        if f_min is not None and t_max is not None and f_min > t_max:
            adapters.append("dc_dc_converter")
            warnings.append("Supply voltage may exceed target input; use regulated converter or adapter.")

    severity: Severity = "ok" if not warnings else "warning"
    reason = "Ports are compatible."
    if warnings:
        reason = "Ports are compatible with warnings."

    return CompatibilityResult(
        compatible=True,
        severity=severity,
        reason=reason,
        warnings=warnings,
        required_adapters=adapters,
        **base,
    )


def check_connection_by_type_ids(
    library: dict[str, Any],
    from_component_type_id: str,
    from_port_id: str,
    to_component_type_id: str,
    to_port_id: str,
) -> CompatibilityResult:
    from_comp = _component_by_id(library, from_component_type_id)
    to_comp = _component_by_id(library, to_component_type_id)
    if from_comp is None:
        return CompatibilityResult(
            compatible=False,
            severity="error",
            reason=f"Unknown component_type_id: {from_component_type_id}",
        )
    if to_comp is None:
        return CompatibilityResult(
            compatible=False,
            severity="error",
            reason=f"Unknown component_type_id: {to_component_type_id}",
        )
    from_port = find_port(from_comp, from_port_id)
    to_port = find_port(to_comp, to_port_id)
    if from_port is None:
        return CompatibilityResult(
            compatible=False,
            severity="error",
            reason=f"Unknown port_id '{from_port_id}' on {from_component_type_id}",
        )
    if to_port is None:
        return CompatibilityResult(
            compatible=False,
            severity="error",
            reason=f"Unknown port_id '{to_port_id}' on {to_component_type_id}",
        )
    return check_port_compatibility(from_comp, from_port, to_comp, to_port)


def _component_by_id(library: dict[str, Any], component_type_id: str) -> dict[str, Any] | None:
    for component in library.get("components") or []:
        if component["component_type_id"] == component_type_id:
            return component
    return None