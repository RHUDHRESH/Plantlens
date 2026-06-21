"""Bundle validation with structured fix hints."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal


@dataclass(frozen=True, slots=True)
class Issue:
    code: str
    severity: Literal["error", "warning"]
    message: str
    fix: str
    field: str | None = None
    entity_id: str | None = None


@dataclass
class ValidationResult:
    errors: list[Issue] = field(default_factory=list)
    warnings: list[Issue] = field(default_factory=list)


def validate_references(bundle: dict[str, Any]) -> list[Issue]:
    issues: list[Issue] = []
    plant_assets = {asset["id"] for asset in bundle["plant"].get("assets", [])}
    tags = {entry["tag"]: entry for entry in bundle["tag_map"].get("tags", [])}

    for entry in bundle["tag_map"].get("tags", []):
        asset_id = entry.get("asset_id")
        if asset_id not in plant_assets:
            issues.append(
                Issue(
                    code="UNKNOWN_ASSET_REF",
                    severity="error",
                    message=f"Tag {entry['tag']} references missing asset {asset_id}.",
                    fix="Create the asset in plant.json or correct asset_id in tag_map.json.",
                    field="asset_id",
                    entity_id=entry["tag"],
                )
            )

    for rule in bundle["alarm_rules"].get("rules", []):
        if rule["tag"] not in tags:
            issues.append(
                Issue(
                    code="UNKNOWN_TAG_REF",
                    severity="error",
                    message=f"Alarm {rule['id']} references unknown tag {rule['tag']}.",
                    fix="Add the tag to tag_map.json or correct the alarm rule tag reference.",
                    field="tag",
                    entity_id=rule["id"],
                )
            )

    node_ids = {node["id"] for node in bundle["causal_graph"].get("nodes", [])}
    for edge in bundle["causal_graph"].get("edges", []):
        for endpoint, label in ((edge.get("from"), "from"), (edge.get("to"), "to")):
            if endpoint not in node_ids:
                issues.append(
                    Issue(
                        code="UNKNOWN_GRAPH_NODE",
                        severity="error",
                        message=f"Edge {edge.get('id')} references unknown node {endpoint}.",
                        fix=f"Add node {endpoint} to causal_graph.json or correct edge {label}.",
                        field=label,
                        entity_id=edge.get("id"),
                    )
                )

    for scenario in bundle["scenarios"].get("scenarios", []):
        for event in scenario.get("events", []):
            if event["tag"] not in tags:
                issues.append(
                    Issue(
                        code="UNKNOWN_SCENARIO_TAG",
                        severity="error",
                        message=f"Scenario {scenario['id']} references unknown tag {event['tag']}.",
                        fix="Add the tag to tag_map.json or correct the scenario event.",
                        field="tag",
                        entity_id=scenario["id"],
                    )
                )

    return issues


def validate_thresholds(bundle: dict[str, Any]) -> list[Issue]:
    issues: list[Issue] = []
    for rule in bundle["alarm_rules"].get("rules", []):
        cond = rule.get("condition", {})
        if cond.get("warning") is not None and cond.get("critical") is not None:
            if float(cond["warning"]) <= float(cond["critical"]):
                issues.append(
                    Issue(
                        code="ILLLOGICAL_BAND_ORDER",
                        severity="error",
                        message=f"Alarm {rule['id']} warning threshold must be less severe than critical for '<' bands.",
                        fix="Set warning above critical for low-voltage style thresholds.",
                        entity_id=rule["id"],
                    )
                )
        if rule.get("deadband", 0) < 0:
            issues.append(
                Issue(
                    code="INVALID_DEADBAND",
                    severity="error",
                    message=f"Alarm {rule['id']} deadband must be >= 0.",
                    fix="Set deadband to zero or a positive hysteresis value.",
                    entity_id=rule["id"],
                )
            )
        if rule.get("severity") not in {"info", "warning", "critical"}:
            issues.append(
                Issue(
                    code="INVALID_SEVERITY",
                    severity="error",
                    message=f"Alarm {rule['id']} severity must be info, warning, or critical.",
                    fix="Use one of the allowed severity enum values.",
                    entity_id=rule["id"],
                )
            )
    return issues


def validate_completeness(bundle: dict[str, Any]) -> list[Issue]:
    warnings: list[Issue] = []
    for asset in bundle["plant"].get("assets", []):
        if "coords_2d" not in asset:
            warnings.append(
                Issue(
                    code="MISSING_COORDS_2D",
                    severity="warning",
                    message=f"Asset {asset['id']} is missing coords_2d.",
                    fix="Add coords_2d for map rendering.",
                    entity_id=asset["id"],
                )
            )
        if "coords_3d" not in asset:
            warnings.append(
                Issue(
                    code="MISSING_COORDS_3D",
                    severity="warning",
                    message=f"Asset {asset['id']} is missing coords_3d.",
                    fix="Add coords_3d for operational 3D viewport placement.",
                    entity_id=asset["id"],
                )
            )
    return warnings


def validate_bundle(bundle: dict[str, Any], graph_issues: list[Issue]) -> ValidationResult:
    errors = validate_references(bundle) + validate_thresholds(bundle) + [
        issue for issue in graph_issues if issue.severity == "error"
    ]
    warnings = validate_completeness(bundle) + [
        issue for issue in graph_issues if issue.severity == "warning"
    ]
    return ValidationResult(errors=errors, warnings=warnings)