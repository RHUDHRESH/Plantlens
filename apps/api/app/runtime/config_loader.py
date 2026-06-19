"""Load compiled/authored bundle into precomputed runtime indexes."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from app.schemas.alarm import AlarmRule, AlarmRules


@dataclass
class GraphEdge:
    id: str
    from_node: str
    to_node: str
    approved: bool
    lag_ms: tuple[int, int]
    edge_type: str
    weight: float = 1.0


@dataclass
class RuntimeConfig:
    plant_id: str
    alarm_rules: list[AlarmRule]
    action_envelope: dict[str, Any]
    asset_index: dict[str, dict[str, Any]]
    tag_index: dict[str, dict[str, Any]]
    graph_index: dict[str, Any] = field(default_factory=dict)


_config: RuntimeConfig | None = None


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _build_asset_index(plant: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {asset["id"]: asset for asset in plant.get("assets", [])}


def _build_tag_index(tag_map: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {entry["tag"]: entry for entry in tag_map.get("tags", [])}


def _build_graph_index(causal_graph: dict[str, Any]) -> dict[str, Any]:
    nodes = {node["id"]: node for node in causal_graph.get("nodes", [])}
    reverse_adjacency: dict[str, list[GraphEdge]] = {node_id: [] for node_id in nodes}
    forward_adjacency: dict[str, list[GraphEdge]] = {node_id: [] for node_id in nodes}

    for edge in causal_graph.get("edges", []):
        graph_edge = GraphEdge(
            id=edge["id"],
            from_node=edge["from"],
            to_node=edge["to"],
            approved=bool(edge.get("approved", False)),
            lag_ms=(int(edge["lag_ms"][0]), int(edge["lag_ms"][1])),
            edge_type=edge.get("edge_type", ""),
            weight=float(edge.get("weight", 1.0)),
        )
        reverse_adjacency.setdefault(graph_edge.to_node, []).append(graph_edge)
        forward_adjacency.setdefault(graph_edge.from_node, []).append(graph_edge)

    return {
        "graph_id": causal_graph.get("graph_id"),
        "nodes": nodes,
        "reverse_adjacency": reverse_adjacency,
        "forward_adjacency": forward_adjacency,
        "root_cause_rules": causal_graph.get("root_cause_rules", []),
        "edges_by_id": {edge["id"]: edge for edge in causal_graph.get("edges", [])},
    }


def load_runtime_config(plant_id: str, *, sample_data_dir: Path) -> RuntimeConfig:
    bundle_dir = sample_data_dir
    plant = _load_json(bundle_dir / "plant.json")
    tag_map = _load_json(bundle_dir / "tag_map.json")
    alarm_rules_doc = AlarmRules.model_validate(_load_json(bundle_dir / "alarm_rules.json"))
    causal_graph = _load_json(bundle_dir / "causal_graph.json")
    action_envelope = yaml.safe_load((bundle_dir / "action_envelope.yaml").read_text(encoding="utf-8"))

    return RuntimeConfig(
        plant_id=plant_id,
        alarm_rules=alarm_rules_doc.rules,
        action_envelope=action_envelope or {"actions": []},
        asset_index=_build_asset_index(plant),
        tag_index=_build_tag_index(tag_map),
        graph_index=_build_graph_index(causal_graph),
    )


def get_runtime_config() -> RuntimeConfig:
    global _config
    if _config is None:
        from app.settings import get_settings

        settings = get_settings()
        bundle_dir = Path(settings.sample_data_dir)
        if not bundle_dir.is_absolute():
            bundle_dir = Path(__file__).resolve().parents[2] / settings.sample_data_dir
        _config = load_runtime_config(settings.active_plant_id, sample_data_dir=bundle_dir)
    return _config


def hot_reload(plant_id: str, *, sample_data_dir: Path) -> RuntimeConfig:
    global _config
    _config = load_runtime_config(plant_id, sample_data_dir=sample_data_dir)
    return _config


def reset_runtime_config_for_tests() -> None:
    global _config
    _config = None