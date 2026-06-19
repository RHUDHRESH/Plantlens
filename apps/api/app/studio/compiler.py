"""Compile authored plant bundle into runtime/HMI artifacts."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from app.runtime.config_loader import hot_reload
from app.studio.config_store import load_authored, load_compiled, save_compiled
from app.studio.graph_checks import check_acyclic, topo_order
from app.studio.validators import validate_bundle


def _canonical_hash(payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _build_asset_index(bundle: dict[str, Any]) -> dict[str, Any]:
    return {asset["id"]: asset for asset in bundle["plant"].get("assets", [])}


def _build_tag_index(bundle: dict[str, Any], asset_index: dict[str, Any]) -> dict[str, Any]:
    index: dict[str, Any] = {}
    for entry in bundle["tag_map"].get("tags", []):
        asset = asset_index.get(entry["asset_id"], {})
        index[entry["tag"]] = {**entry, "asset_type": asset.get("type")}
    return index


def _build_alarm_index(bundle: dict[str, Any], tag_index: dict[str, Any]) -> dict[str, Any]:
    return {
        rule["id"]: {**rule, "tag_meta": tag_index.get(rule["tag"])}
        for rule in bundle["alarm_rules"].get("rules", [])
    }


def _build_graph_index(bundle: dict[str, Any]) -> dict[str, Any]:
    approved_edges = [edge for edge in bundle["causal_graph"].get("edges", []) if edge.get("approved")]
    reverse_adjacency: dict[str, list[dict[str, Any]]] = {}
    for edge in approved_edges:
        reverse_adjacency.setdefault(edge["to"], []).append(edge)
    return {
        "nodes": {node["id"]: node for node in bundle["causal_graph"].get("nodes", [])},
        "approved_edges": approved_edges,
        "reverse_adjacency": reverse_adjacency,
        "topo_order": topo_order(bundle),
    }


def _build_hmi_view_model(
    bundle: dict[str, Any],
    asset_index: dict[str, Any],
    tag_index: dict[str, Any],
    alarm_index: dict[str, Any],
) -> dict[str, Any]:
    nodes_2d = []
    for asset_id, asset in sorted(asset_index.items()):
        tags = sorted(tag for tag, meta in tag_index.items() if meta.get("asset_id") == asset_id)
        alarms = sorted(
            alarm_id
            for alarm_id, rule in alarm_index.items()
            if rule.get("asset_id") == asset_id
        )
        coords = asset.get("coords_2d", {"x": 0, "y": 0})
        nodes_2d.append(
            {
                "id": asset_id,
                "label": asset.get("display_name", asset_id),
                "asset_type": asset.get("type", "unknown"),
                "criticality": asset.get("criticality"),
                "position": coords,
                "tags": tags,
                "alarms": alarms,
                "status_binding": f"asset_status.{asset_id}",
            }
        )

    edges_2d = [
        {
            "id": f"{conn['from']}->{conn['to']}",
            "from": conn["from"],
            "to": conn["to"],
            "type": "power_flow" if conn.get("kind") == "power" else "signal",
        }
        for conn in bundle["plant"].get("connections", [])
    ]

    nodes_3d = [
        {
            "id": node["id"],
            "label": node["label"],
            "position": asset_index.get(node["id"], {}).get("coords_3d", {"x": 0, "y": 0, "z": 0}),
            "model": asset_index.get(node["id"], {}).get("coords_3d", {}).get("model", "box"),
        }
        for node in nodes_2d
    ]

    return {
        "view_id": bundle["plant"].get("plant_id", "plant"),
        "version": bundle["plant"].get("version", "1.0.0"),
        "for_role": "operator",
        "theme": "dark-hmi",
        "layout": {"mode": "hybrid_2d_3d", "default_view": "2d"},
        "map_2d": {"nodes": nodes_2d, "edges": edges_2d},
        "map_3d": {"nodes": nodes_3d, "edges": edges_2d},
        "widgets": [
            {"id": "alarm-table", "type": "alarm-table"},
            {"id": "root-cause-card", "type": "root-cause-card"},
        ],
        "panels": [
            {"id": "situation_stack", "type": "situation_stack", "position": "right"},
            {"id": "alarm_table", "type": "alarm_table", "position": "bottom"},
        ],
    }


def compile_authored_bundle(
    *,
    plant_id: str,
    bundle: dict[str, Any],
    compiled_dir: Path,
) -> dict[str, Any]:
    graph_issues = check_acyclic(bundle)
    validation = validate_bundle(bundle, graph_issues)
    if validation.errors:
        previous = load_compiled(compiled_dir, plant_id)
        return {
            "status": "error",
            "errors": [issue.__dict__ for issue in validation.errors],
            "warnings": [issue.__dict__ for issue in validation.warnings],
            "previous_hash": previous.get("content_hash") if previous else None,
        }

    asset_index = _build_asset_index(bundle)
    tag_index = _build_tag_index(bundle, asset_index)
    alarm_index = _build_alarm_index(bundle, tag_index)
    graph_index = _build_graph_index(bundle)
    hmi = _build_hmi_view_model(bundle, asset_index, tag_index, alarm_index)

    compiled = {
        "plant_id": plant_id,
        "content_hash": "",
        "version": bundle["plant"].get("version", "1.0.0"),
        "asset_index": asset_index,
        "tag_index": tag_index,
        "alarm_index": alarm_index,
        "graph_index": graph_index,
        "hmi_view_model": hmi,
        "validation": {
            "errors": [issue.__dict__ for issue in validation.errors],
            "warnings": [issue.__dict__ for issue in validation.warnings],
        },
    }
    compiled["content_hash"] = _canonical_hash(
        {
            "asset_index": compiled["asset_index"],
            "tag_index": compiled["tag_index"],
            "alarm_index": compiled["alarm_index"],
            "graph_index": compiled["graph_index"],
            "hmi_view_model": compiled["hmi_view_model"],
        }
    )

    previous = load_compiled(compiled_dir, plant_id)
    save_compiled(compiled_dir, plant_id, compiled)

    return {
        "status": "ok",
        "compiled": compiled,
        "warnings": [issue.__dict__ for issue in validation.warnings],
        "previous_hash": previous.get("content_hash") if previous else None,
    }


def compile_project(
    *,
    plant_id: str,
    sample_data_dir: Path,
    compiled_dir: Path,
) -> dict[str, Any]:
    bundle = load_authored(sample_data_dir)
    result = compile_authored_bundle(
        plant_id=plant_id,
        bundle=bundle,
        compiled_dir=compiled_dir,
    )
    if result.get("status") == "ok":
        hot_reload(plant_id, sample_data_dir=sample_data_dir)
    return result