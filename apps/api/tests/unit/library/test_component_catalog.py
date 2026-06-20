"""Unit tests for component library catalog loader."""

from __future__ import annotations

from app.library.catalog import (
    get_component,
    group_components_by_category,
    list_components,
    load_standard_component_library,
)


def test_standard_library_loads():
    library = load_standard_component_library()
    assert library["library_id"]
    assert library["version"]
    assert len(library["components"]) >= 24


def test_library_has_target_component_count():
    components = list_components()
    assert len(components) >= 24
    assert len(components) == 27


def test_component_type_ids_are_unique():
    ids = [c["component_type_id"] for c in list_components()]
    assert len(ids) == len(set(ids))


def test_each_component_has_visual_asset():
    for component in list_components():
        assert "visual_asset" in component
        visual = component["visual_asset"]
        assert visual.get("icon_kind") in {"inline_svg", "render_hint"}
        if visual["icon_kind"] == "inline_svg":
            assert visual.get("icon_svg")
            assert "viewBox" in visual["icon_svg"]


def test_each_component_has_ports():
    for component in list_components():
        assert component["ports"]
        port_ids = [p["port_id"] for p in component["ports"]]
        assert len(port_ids) == len(set(port_ids))


def test_get_component_returns_motor():
    motor = get_component("dc_motor_12v")
    assert motor is not None
    assert motor["display_name"] == "12V DC Motor"


def test_get_unknown_component_returns_none():
    assert get_component("not_a_real_component") is None


def test_group_components_by_category():
    grouped = group_components_by_category()
    assert "power_electrical" in grouped
    assert "sensors" in grouped
    total = sum(len(items) for items in grouped.values())
    assert total == 27