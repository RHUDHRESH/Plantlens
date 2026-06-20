"""Unit tests for component library validators."""

from __future__ import annotations

import re

import pytest

from app.library.catalog import load_standard_component_library
from app.library.validators import (
    LibraryValidationError,
    validate_component_library,
    validate_component_template,
    validate_visual_asset,
)

_SCRIPT = re.compile(r"<script\b", re.IGNORECASE)
_EXTERNAL = re.compile(r"""href\s*=\s*["']https?://""", re.IGNORECASE)


def test_validate_component_library_passes_for_standard_data():
    library = load_standard_component_library()
    validate_component_library(library)


def test_no_svg_contains_script_tag():
    for component in load_standard_component_library()["components"]:
        svg = component["visual_asset"].get("icon_svg", "")
        if svg:
            assert not _SCRIPT.search(svg), component["component_type_id"]


def test_no_svg_contains_external_href():
    for component in load_standard_component_library()["components"]:
        svg = component["visual_asset"].get("icon_svg", "")
        if svg:
            assert not _EXTERNAL.search(svg), component["component_type_id"]


def test_signal_source_port_references_valid_port():
    for component in load_standard_component_library()["components"]:
        port_ids = {p["port_id"] for p in component["ports"]}
        for signal in component.get("signal_templates", []):
            assert signal["source_port_id"] in port_ids


def test_major_components_have_at_least_two_fault_modes():
    major = {"power_electrical", "actuation_mechanical", "process_physical"}
    for component in load_standard_component_library()["components"]:
        if component["category"] in major:
            assert len(component["fault_modes"]) >= 2, component["component_type_id"]


def test_each_fault_mode_has_operator_actions():
    for component in load_standard_component_library()["components"]:
        for fault in component.get("fault_modes", []):
            assert fault.get("operator_actions"), component["component_type_id"]


def test_fault_evidence_references_known_signals():
    for component in load_standard_component_library()["components"]:
        signal_ids = {s["signal_template_id"] for s in component.get("signal_templates", [])}
        for fault in component.get("fault_modes", []):
            for evidence in fault.get("required_evidence", []) + fault.get("optional_evidence", []):
                ref = evidence.get("signal_template_id")
                if ref:
                    assert ref in signal_ids, component["component_type_id"]


def test_validate_visual_asset_rejects_script():
    with pytest.raises(LibraryValidationError, match="script"):
        validate_visual_asset({
            "icon_kind": "inline_svg",
            "icon_svg": '<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>',
            "node_shape": "x",
            "low_poly_shape": "x",
            "accent_role": "power",
            "port_layout": {"left": [], "right": [], "top": [], "bottom": []},
            "size_hint": {"width": 10, "height": 10},
            "preview_label": "x",
            "render_tokens": {"base": "a", "accent": "b", "danger": "c"},
        })


def test_validate_component_template_rejects_bad_signal_port():
    library = load_standard_component_library()
    bad = dict(library["components"][0])
    bad["signal_templates"] = [{
        "signal_template_id": "bad_signal",
        "name": "Bad",
        "quantity_kind": "voltage",
        "unit": "V",
        "expected_min": 0,
        "expected_max": 1,
        "sampling_hint_ms": 500,
        "quality_required": "GOOD",
        "source_port_id": "nonexistent_port",
        "evidence_weight_default": 0.5,
        "alarm_thresholds": {},
    }]
    with pytest.raises(LibraryValidationError, match="unknown port"):
        validate_component_template(bad)