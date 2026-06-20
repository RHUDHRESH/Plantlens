"""Deterministic validation for the component standard library."""

from __future__ import annotations

import re
from typing import Any

_SCRIPT_TAG = re.compile(r"<script\b", re.IGNORECASE)
_EXTERNAL_HREF = re.compile(r"""href\s*=\s*["']https?://""", re.IGNORECASE)
_XLINK_HREF = re.compile(r"""xlink:href\s*=\s*["']https?://""", re.IGNORECASE)

MAJOR_CATEGORIES = frozenset({"power_electrical", "actuation_mechanical", "process_physical"})


class LibraryValidationError(ValueError):
    """Raised when library or component validation fails."""


def validate_visual_asset(visual_asset: dict[str, Any]) -> None:
    icon_kind = visual_asset.get("icon_kind")
    if icon_kind == "inline_svg":
        icon_svg = visual_asset.get("icon_svg", "")
        if not icon_svg or "viewBox" not in icon_svg:
            raise LibraryValidationError("inline_svg visual_asset requires icon_svg with viewBox")
        if _SCRIPT_TAG.search(icon_svg):
            raise LibraryValidationError("icon_svg must not contain script tags")
        if _EXTERNAL_HREF.search(icon_svg) or _XLINK_HREF.search(icon_svg):
            raise LibraryValidationError("icon_svg must not contain external href references")
    elif icon_kind != "render_hint":
        raise LibraryValidationError(f"unsupported icon_kind: {icon_kind}")


def validate_component_template(component: dict[str, Any]) -> None:
    component_id = component.get("component_type_id", "<unknown>")
    ports = component.get("ports") or []
    if not ports:
        raise LibraryValidationError(f"{component_id}: component must have at least one port")

    port_ids = [p["port_id"] for p in ports]
    if len(port_ids) != len(set(port_ids)):
        raise LibraryValidationError(f"{component_id}: duplicate port_id within component")

    signal_ids: list[str] = []
    for signal in component.get("signal_templates") or []:
        signal_id = signal["signal_template_id"]
        signal_ids.append(signal_id)
        source_port = signal.get("source_port_id")
        if source_port not in port_ids:
            raise LibraryValidationError(
                f"{component_id}: signal {signal_id} references unknown port {source_port}"
            )
    if len(signal_ids) != len(set(signal_ids)):
        raise LibraryValidationError(f"{component_id}: duplicate signal_template_id")

    fault_ids: list[str] = []
    known_signals = set(signal_ids)
    for fault in component.get("fault_modes") or []:
        fault_id = fault["fault_mode_id"]
        fault_ids.append(fault_id)
        actions = fault.get("operator_actions") or []
        if not actions:
            raise LibraryValidationError(f"{component_id}: fault {fault_id} missing operator_actions")
        for evidence in (fault.get("required_evidence") or []) + (fault.get("optional_evidence") or []):
            ref = evidence.get("signal_template_id")
            if ref and ref not in known_signals:
                raise LibraryValidationError(
                    f"{component_id}: fault {fault_id} references unknown signal {ref}"
                )
    if len(fault_ids) != len(set(fault_ids)):
        raise LibraryValidationError(f"{component_id}: duplicate fault_mode_id")

    category = component.get("category")
    if category in MAJOR_CATEGORIES and len(fault_ids) < 2:
        raise LibraryValidationError(f"{component_id}: major component requires at least 2 fault modes")

    visual = component.get("visual_asset")
    if not visual:
        raise LibraryValidationError(f"{component_id}: missing visual_asset")
    validate_visual_asset(visual)


def validate_reference_integrity(library: dict[str, Any]) -> None:
    type_ids = [c["component_type_id"] for c in library.get("components") or []]
    if len(type_ids) != len(set(type_ids)):
        raise LibraryValidationError("duplicate component_type_id in library")


def validate_component_library(library: dict[str, Any]) -> None:
    components = library.get("components")
    if not components:
        raise LibraryValidationError("library must contain components")
    if len(components) < 24:
        raise LibraryValidationError(f"library must contain at least 24 components, got {len(components)}")

    validate_reference_integrity(library)
    for component in components:
        validate_component_template(component)