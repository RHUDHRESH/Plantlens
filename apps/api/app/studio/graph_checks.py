"""Compile-time causal graph checks."""

from __future__ import annotations

from typing import Any

import networkx as nx

from app.studio.validators import Issue


def _build_graph(bundle: dict[str, Any]) -> nx.DiGraph:
    graph = nx.DiGraph()
    for node in bundle["causal_graph"].get("nodes", []):
        graph.add_node(node["id"])
    for edge in bundle["causal_graph"].get("edges", []):
        graph.add_edge(edge["from"], edge["to"], edge_id=edge.get("id"))
    return graph


def check_acyclic(bundle: dict[str, Any]) -> list[Issue]:
    graph = _build_graph(bundle)
    if nx.is_directed_acyclic_graph(graph):
        return []
    cycle = next(nx.simple_cycles(graph))
    chain = " → ".join([*cycle, cycle[0]])
    return [
        Issue(
            code="GRAPH_HAS_CYCLE",
            severity="error",
            message=f"Causal graph contains a cycle: {chain}",
            fix="Remove or reverse one edge in that chain. The runtime graph must be acyclic.",
        )
    ]


def topo_order(bundle: dict[str, Any]) -> list[str]:
    graph = _build_graph(bundle)
    return list(nx.lexicographical_topological_sort(graph))