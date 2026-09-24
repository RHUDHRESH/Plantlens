"""Causal graph validation and compile step."""

from __future__ import annotations

from dataclasses import dataclass, field
from hashlib import sha256
import json
from typing import Any

from app.runtime.causal.structure import tarjan_scc


@dataclass
class CompileError:
    field: str
    message: str
    fix: str


@dataclass
class GraphCompileResult:
    ok: bool
    graph_hash: str = ""
    version: str = ""
    errors: list[CompileError] = field(default_factory=list)
    approved_edge_index: dict[str, dict[str, Any]] = field(default_factory=dict)
    reverse_adjacency: dict[str, list[str]] = field(default_factory=dict)
    situation_pattern_index: dict[str, dict[str, Any]] = field(default_factory=dict)
    feedback_loops: list[dict[str, Any]] = field(default_factory=list)


def _cycles(approved_edges: list[dict[str, Any]]) -> list[tuple[list[str], list[dict[str, Any]]]]:
    """Strongly-connected components containing a cycle, as (members, internal edges)."""
    ordered = sorted(approved_edges, key=lambda e: e["id"])
    nodes = sorted({e["from"] for e in ordered} | {e["to"] for e in ordered})
    successors: dict[str, list[str]] = {n: [] for n in nodes}
    for edge in ordered:
        successors[edge["from"]].append(edge["to"])
    out: list[tuple[list[str], list[dict[str, Any]]]] = []
    for comp in tarjan_scc(nodes, successors):
        members = set(comp)
        internal = [e for e in ordered if e["from"] in members and e["to"] in members]
        if len(comp) > 1 or internal:
            out.append((comp, internal))
    return out


def validate_and_compile_graph(
    *,
    plant: dict[str, Any],
    tag_map: dict[str, Any],
    alarm_rules: dict[str, Any],
    causal_graph: dict[str, Any],
) -> GraphCompileResult:
    errors: list[CompileError] = []
    asset_ids = {a["id"] for a in plant.get("assets", [])}
    tag_ids = {t["tag"] for t in tag_map.get("tags", [])}
    alarm_ids = {r["id"] for r in alarm_rules.get("rules", [])}

    nodes = {n["id"]: n for n in causal_graph.get("nodes", [])}
    edges = causal_graph.get("edges", [])
    edge_ids_seen: set[str] = set()

    for node_id in nodes:
        if node_id not in asset_ids:
            errors.append(
                CompileError(
                    f"nodes.{node_id}",
                    f"Unknown asset {node_id}",
                    "Add the asset to plant.json or remove the graph node",
                )
            )

    approved_edges: list[dict[str, Any]] = []
    approved_edge_index: dict[str, dict[str, Any]] = {}
    reverse_adjacency: dict[str, list[str]] = {nid: [] for nid in nodes}

    for edge in edges:
        eid = edge.get("id", "")
        if eid in edge_ids_seen:
            errors.append(
                CompileError(f"edges.{eid}", f"Duplicate edge id {eid}", "Use unique edge ids")
            )
        edge_ids_seen.add(eid)

        if edge.get("from") not in asset_ids:
            errors.append(
                CompileError(f"edges.{eid}.from", f"Unknown from asset {edge.get('from')}", "Fix edge endpoints")
            )
        if edge.get("to") not in asset_ids:
            errors.append(
                CompileError(f"edges.{eid}.to", f"Unknown to asset {edge.get('to')}", "Fix edge endpoints")
            )

        lag = edge.get("lag_ms", [0, 0])
        if lag[0] < 0 or lag[1] < 0:
            errors.append(
                CompileError(f"edges.{eid}.lag_ms", "Negative lag window", "lag_ms must be non-negative")
            )

        if edge.get("approved", False):
            approved_edges.append(edge)
            approved_edge_index[eid] = edge
            reverse_adjacency.setdefault(edge["to"], []).append(edge["from"])

    feedback_loops: list[dict[str, Any]] = []
    for members, internal in _cycles(approved_edges):
        unflagged = [e["id"] for e in internal if not e.get("loop_ok", False)]
        if unflagged:
            errors.append(
                CompileError(
                    "edges",
                    f"Cycle detected: {' → '.join(members)} (edges without loop_ok: {', '.join(unflagged)})",
                    "Unapprove an edge to break the cycle, or have an engineer flag every edge of an "
                    "intended feedback loop with loop_ok=true",
                )
            )
        else:
            feedback_loops.append(
                {
                    "members": members,
                    "edge_ids": [e["id"] for e in internal],
                    "loop_ids": sorted({e["loop_id"] for e in internal if e.get("loop_id")}),
                }
            )

    for spec in causal_graph.get("situation_types", []):
        sid = spec.get("id", "unknown")
        for alarm_id in spec.get("required_alarms", []):
            if alarm_id not in alarm_ids:
                errors.append(
                    CompileError(
                        f"situation_types.{sid}",
                        f"Unknown alarm {alarm_id}",
                        "Reference a valid alarm rule id",
                    )
                )
        for cond in spec.get("extra_conditions", []):
            if cond.get("type") == "tag_threshold" and cond.get("tag_id") not in tag_ids:
                errors.append(
                    CompileError(
                        f"situation_types.{sid}",
                        f"Unknown tag {cond.get('tag_id')}",
                        "Reference a valid tag from tag_map.json",
                    )
                )

    for rule in causal_graph.get("root_cause_rules", []):
        for cond in rule.get("conditions", []):
            if cond.get("type") == "tag_threshold" and cond.get("tag_id") not in tag_ids:
                errors.append(
                    CompileError(
                        f"root_cause_rules.{rule.get('target_node')}",
                        f"Unknown tag {cond.get('tag_id')}",
                        "Fix tag reference in root cause rule",
                    )
                )

    graph_bytes = json.dumps(causal_graph, sort_keys=True).encode()
    graph_hash = sha256(graph_bytes).hexdigest()[:16]
    version = causal_graph.get("version", "1.0.0")

    situation_pattern_index = {s["id"]: s for s in causal_graph.get("situation_types", [])}

    return GraphCompileResult(
        ok=not errors,
        graph_hash=graph_hash,
        version=version,
        errors=errors,
        approved_edge_index=approved_edge_index,
        reverse_adjacency=reverse_adjacency,
        situation_pattern_index=situation_pattern_index,
        feedback_loops=feedback_loops,
    )