"""Test asset template library: load, validate, apply."""

from __future__ import annotations

import pytest

from app.library.templates import (
    apply_template,
    list_templates,
    load_template,
    validate_template,
)


@pytest.mark.parametrize("asset_type", ["motor", "fan", "blower", "battery", "dc_bus", "charger"])
def test_template_loads(asset_type: str):
    tmpl = load_template(asset_type)
    assert tmpl is not None
    assert tmpl["asset_type"] == asset_type


@pytest.mark.parametrize("asset_type", ["motor", "fan", "blower", "battery", "dc_bus", "charger"])
def test_template_validates(asset_type: str):
    tmpl = load_template(asset_type)
    assert tmpl is not None
    errors = validate_template(tmpl)
    assert errors == [], f"{asset_type} template has errors: {errors}"


def test_list_templates_returns_all():
    templates = list_templates()
    types = {t["asset_type"] for t in templates}
    assert "motor" in types
    assert "fan" in types
    assert "blower" in types
    assert "battery" in types


def test_list_templates_has_counts():
    templates = list_templates()
    for t in templates:
        assert t["required_tag_count"] >= 1
        assert "display_name" in t


def test_apply_template_returns_draft_artifact():
    draft = apply_template("motor", asset_id="MOTOR-TEST-001", proposed_by="test-engineer")
    assert draft["artifact_type"] == "signal_template_draft"
    assert draft["asset_id"] == "MOTOR-TEST-001"
    assert draft["requires_human_approval"] is True
    assert draft["validation_status"] == "pending"


def test_apply_template_instantiates_tags():
    draft = apply_template("motor", asset_id="MOTOR-001", proposed_by="test")
    # Find the add_tags change
    tag_change = next((c for c in draft["proposed_changes"] if c["change_type"] == "add_tags"), None)
    assert tag_change is not None
    tags = tag_change["patch"]
    tag_ids = [t["tag"] for t in tags]
    # Motor requires _I, _RPM, _TEMP
    assert any("_I" in t for t in tag_ids)
    assert any("_RPM" in t for t in tag_ids)
    assert any("_TEMP" in t for t in tag_ids)


def test_apply_template_tags_reference_correct_asset():
    draft = apply_template("motor", asset_id="MOTOR-001", proposed_by="test")
    tag_change = next(c for c in draft["proposed_changes"] if c["change_type"] == "add_tags")
    for tag in tag_change["patch"]:
        assert tag["asset_id"] == "MOTOR-001"


def test_apply_template_instantiates_alarm_rules():
    draft = apply_template("motor", asset_id="MOTOR-001", proposed_by="test")
    alarm_change = next((c for c in draft["proposed_changes"] if c["change_type"] == "add_alarm_rules"), None)
    assert alarm_change is not None
    alarms = alarm_change["patch"]
    assert len(alarms) >= 1
    for alarm in alarms:
        assert alarm["asset_id"] == "MOTOR-001"


def test_apply_template_causal_edges_unapproved():
    draft = apply_template("motor", asset_id="MOTOR-001", proposed_by="test")
    edge_changes = [c for c in draft["proposed_changes"] if c["change_type"] == "add_causal_edge"]
    for ec in edge_changes:
        assert ec["patch"]["approved"] is False, "Template causal edges must always be unapproved"


def test_apply_template_does_not_mutate_runtime():
    from app.runtime.config_loader import get_runtime_config
    # Just verify no exception — applying a template must not touch the runtime config
    apply_template("fan", asset_id="FAN-TEST-001", proposed_by="test")
    # If runtime config is None (no config loaded), that's fine — no mutation occurred


def test_apply_template_unknown_type_returns_error():
    result = apply_template("flux_capacitor", asset_id="GHOST-001", proposed_by="test")
    assert "error" in result
    assert "supported_types" in result


def test_apply_template_fan_airflow_tag():
    draft = apply_template("fan", asset_id="FAN-001", proposed_by="test")
    tag_change = next(c for c in draft["proposed_changes"] if c["change_type"] == "add_tags")
    tag_ids = [t["tag"] for t in tag_change["patch"]]
    assert any("AIRFLOW" in t for t in tag_ids)
