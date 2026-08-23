"""Asset template library — load, list, and apply signal/alarm/causal templates.

Templates are drafts only. Applying a template produces a DraftArtifact.
It never mutates live config.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

_TEMPLATES_DIR = Path(__file__).resolve().parents[4] / "packages" / "sample-data" / "templates"
_SUPPORTED_TYPES = frozenset(
    {"motor", "fan", "blower", "battery", "dc_bus", "charger"}
)


def _template_path(asset_type: str) -> Path:
    return _TEMPLATES_DIR / f"{asset_type}.template.json"


def load_template(asset_type: str) -> dict[str, Any] | None:
    path = _template_path(asset_type)
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def list_templates() -> list[dict[str, Any]]:
    result = []
    for asset_type in sorted(_SUPPORTED_TYPES):
        tmpl = load_template(asset_type)
        if tmpl:
            result.append(
                {
                    "asset_type": asset_type,
                    "display_name": tmpl.get("display_name", asset_type),
                    "version": tmpl.get("version", "1.0.0"),
                    "description": tmpl.get("description", ""),
                    "required_tag_count": len(tmpl.get("required_tags", [])),
                    "optional_tag_count": len(tmpl.get("optional_tags", [])),
                    "default_alarm_count": len(tmpl.get("default_alarm_rules", [])),
                }
            )
    return result


def validate_template(template: dict[str, Any]) -> list[str]:
    """Return list of validation errors (empty = valid)."""
    errors: list[str] = []
    if "asset_type" not in template:
        errors.append("Missing 'asset_type' field.")
    if not template.get("required_tags"):
        errors.append("At least one required_tag must be defined.")
    for rule in template.get("default_alarm_rules", []):
        if "alarm_suffix" not in rule:
            errors.append(f"default_alarm_rule missing 'alarm_suffix': {rule}")
        if "tag_suffix" not in rule:
            errors.append(f"default_alarm_rule missing 'tag_suffix': {rule}")
        if "op" not in rule:
            errors.append(f"default_alarm_rule missing 'op': {rule}")
    return errors


def apply_template(
    asset_type: str,
    *,
    asset_id: str,
    instance_hint: str = "",
    proposed_by: str = "system",
) -> dict[str, Any]:
    """Instantiate a template for a specific asset_id.

    Returns a DraftArtifact — never mutates the authored bundle directly.
    The caller must submit this to the agent approval pipeline.
    """
    template = load_template(asset_type)
    if template is None:
        return {
            "artifact_type": "template_apply_error",
            "error": f"No template found for asset_type '{asset_type}'.",
            "supported_types": sorted(_SUPPORTED_TYPES),
        }

    prefix = asset_id.replace("-", "_").replace(".", "_")
    now = datetime.now(UTC).isoformat().replace("+00:00", "Z")

    # Instantiate tags
    instantiated_tags = [
        {
            "tag": f"{prefix}{t['tag_suffix']}",
            "asset_id": asset_id,
            "signal_name": t["signal_name"],
            "unit": t["unit"],
            "data_type": t["data_type"],
            "required": True,
        }
        for t in template.get("required_tags", [])
    ] + [
        {
            "tag": f"{prefix}{t['tag_suffix']}",
            "asset_id": asset_id,
            "signal_name": t["signal_name"],
            "unit": t["unit"],
            "data_type": t["data_type"],
            "required": False,
        }
        for t in template.get("optional_tags", [])
    ]

    # Instantiate alarm rules
    instantiated_alarms = [
        {
            "id": f"{prefix}_{r['alarm_suffix']}",
            "tag": f"{prefix}{r['tag_suffix']}",
            "asset_id": asset_id,
            "severity": r.get("severity", "warning"),
            "condition": {
                "op": r["op"],
                "value": r.get("critical_threshold", r.get("warning_threshold", 0)),
            },
            "debounce_ms": r.get("debounce_ms", 0),
            "deadband": r.get("deadband", 0),
            "unit": r.get("unit", ""),
        }
        for r in template.get("default_alarm_rules", [])
    ]

    # Instantiate causal edge hints (approved=false, user must review)
    instantiated_edges = [
        {
            **{k: v for k, v in e.items() if k not in ("from", "to")},
            "id": f"E_TMPL_{prefix}_{i}",
            "from": e.get("from", "").replace("{asset_id}", asset_id),
            "to": e.get("to", ""),
            "approved": False,
            "provenance": "template",
        }
        for i, e in enumerate(template.get("default_causal_edges", []))
    ]

    return {
        "draft_id": f"DRF_TMPL_{uuid.uuid4().hex[:8].upper()}",
        "artifact_type": "signal_template_draft",
        "asset_type": asset_type,
        "asset_id": asset_id,
        "instance_hint": instance_hint,
        "created_at": now,
        "created_by": proposed_by,
        "proposed_changes": [
            {
                "change_type": "add_tags",
                "target_path": "/tag_map/tags",
                "patch": instantiated_tags,
                "rationale": f"Tags from {asset_type} template for {asset_id}.",
                "evidence_refs": [],
                "risk_level": "low",
            },
            {
                "change_type": "add_alarm_rules",
                "target_path": "/alarm_rules/rules",
                "patch": instantiated_alarms,
                "rationale": f"Default alarm rules from {asset_type} template for {asset_id}.",
                "evidence_refs": [],
                "risk_level": "low",
            },
        ]
        + [
            {
                "change_type": "add_causal_edge",
                "target_path": "/causal_graph/edges",
                "patch": edge,
                "rationale": f"Template causal edge for {asset_id}. Review from/to before approving.",
                "evidence_refs": [],
                "risk_level": "medium",
            }
            for edge in instantiated_edges
        ],
        "requires_human_approval": True,
        "validation_status": "pending",
        "status": "pending",
        "note": (
            f"Template applied for {asset_id}. "
            "Review all tags, alarms, and causal edges before adding to plant bundle. "
            "Causal edges have approved=false and must be validated before runtime use."
        ),
    }
