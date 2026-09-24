"""Compiled causal structure over APPROVED edges only (R2).

Built once per approved-edge set and cached; the runtime only reads it. Supports
engineer-flagged feedback loops: strongly-connected components (Tarjan) are condensed so
propagation windows stay finite, and every cycle must consist solely of ``loop_ok`` edges
(enforced by ``graph_compile``; here unflagged cycles are still traversed safely).
"""

from __future__ import annotations

import heapq
from collections import OrderedDict
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from app.runtime.config_loader import GraphEdge


@dataclass(frozen=True, slots=True)
class Reach:
    """How a root's influence arrives at a downstream node."""

    min_ms: int
    max_ms: int
    path_edges: tuple[str, ...]  # fastest approved path (for explanation)
    polarity: int | None  # +1 / -1 along path_edges, None when any edge is "any"
    via_loop: bool  # True when the path passes through a feedback-loop component


@dataclass(frozen=True)
class CausalStructure:
    nodes: tuple[str, ...]
    forward: dict[str, tuple[GraphEdge, ...]]
    reverse: dict[str, tuple[GraphEdge, ...]]
    component_of: dict[str, int]
    components: tuple[tuple[str, ...], ...]
    cyclic_components: frozenset[int]
    unflagged_cycle_edges: frozenset[str]
    _reach: dict[str, dict[str, Reach]] = field(default_factory=dict, repr=False)
    _ancestors: dict[str, frozenset[str]] = field(default_factory=dict, repr=False)

    def reach_from(self, root: str) -> dict[str, Reach]:
        cached = self._reach.get(root)
        if cached is None:
            cached = _compute_reach(self, root)
            self._reach[root] = cached
        return cached

    def ancestors_of(self, node: str) -> frozenset[str]:
        """Nodes with an approved path to ``node`` (excluding ``node`` unless in a loop)."""
        cached = self._ancestors.get(node)
        if cached is None:
            seen: set[str] = set()
            stack = [node]
            while stack:
                current = stack.pop()
                for edge in self.reverse.get(current, ()):
                    if edge.from_node not in seen:
                        seen.add(edge.from_node)
                        stack.append(edge.from_node)
            cached = frozenset(seen)
            self._ancestors[node] = cached
        return cached

    def loop_members(self, node: str) -> tuple[str, ...]:
        comp = self.component_of.get(node)
        if comp is None or comp not in self.cyclic_components:
            return ()
        return self.components[comp]


def _polarity_sign(edge: GraphEdge) -> int | None:
    if edge.polarity == "+":
        return 1
    if edge.polarity == "-":
        return -1
    return None


def tarjan_scc(nodes: list[str], successors: dict[str, Sequence[str]]) -> list[list[str]]:
    """Iterative Tarjan SCC, sinks first (reverse topological order); deterministic."""
    index_of: dict[str, int] = {}
    low: dict[str, int] = {}
    on_stack: set[str] = set()
    stack: list[str] = []
    components: list[list[str]] = []
    counter = 0

    for start in nodes:
        if start in index_of:
            continue
        work: list[tuple[str, int]] = [(start, 0)]
        while work:
            node, child_i = work.pop()
            if child_i == 0:
                index_of[node] = low[node] = counter
                counter += 1
                stack.append(node)
                on_stack.add(node)
            children = successors.get(node, ())
            recursed = False
            while child_i < len(children):
                child = children[child_i]
                child_i += 1
                if child not in index_of:
                    work.append((node, child_i))
                    work.append((child, 0))
                    recursed = True
                    break
                if child in on_stack:
                    low[node] = min(low[node], index_of[child])
            if recursed:
                continue
            if low[node] == index_of[node]:
                comp: list[str] = []
                while True:
                    member = stack.pop()
                    on_stack.discard(member)
                    comp.append(member)
                    if member == node:
                        break
                components.append(sorted(comp))
            if work:
                parent = work[-1][0]
                low[parent] = min(low[parent], low[node])
    return components


def build_structure(graph_index: dict[str, Any]) -> CausalStructure:
    node_ids: set[str] = set(graph_index.get("nodes", {}))
    approved: list[GraphEdge] = []
    for edges in graph_index.get("reverse_adjacency", {}).values():
        for edge in edges:
            if edge.approved:
                approved.append(edge)
                node_ids.add(edge.from_node)
                node_ids.add(edge.to_node)
    approved.sort(key=lambda e: e.id)
    nodes = sorted(node_ids)

    forward_l: dict[str, list[GraphEdge]] = {n: [] for n in nodes}
    reverse_l: dict[str, list[GraphEdge]] = {n: [] for n in nodes}
    for edge in approved:
        forward_l[edge.from_node].append(edge)
        reverse_l[edge.to_node].append(edge)
    forward = {n: tuple(es) for n, es in forward_l.items()}
    reverse = {n: tuple(es) for n, es in reverse_l.items()}

    comps = tarjan_scc(nodes, {n: [e.to_node for e in es] for n, es in forward.items()})
    component_of = {member: i for i, comp in enumerate(comps) for member in comp}
    cyclic: set[int] = set()
    unflagged: set[str] = set()
    for edge in approved:
        ci = component_of[edge.from_node]
        if ci == component_of[edge.to_node] and (len(comps[ci]) > 1 or edge.from_node == edge.to_node):
            cyclic.add(ci)
            if not edge.loop_ok:
                unflagged.add(edge.id)

    return CausalStructure(
        nodes=tuple(nodes),
        forward=forward,
        reverse=reverse,
        component_of=component_of,
        components=tuple(tuple(c) for c in comps),
        cyclic_components=frozenset(cyclic),
        unflagged_cycle_edges=frozenset(unflagged),
    )


def _compute_reach(structure: CausalStructure, root: str) -> dict[str, Reach]:
    """Fastest path (Dijkstra on lag_min) + conservative slowest arrival over the condensation.

    Slowest arrival in a graph with loops is unbounded in principle; we bound it by allowing
    one pass through each loop component (sum of its internal max lags), which is the dwell an
    engineer-approved feedback loop can add before its effect is expected downstream.
    """
    if root not in structure.forward:
        return {}

    # Fastest arrival + explanation path.
    best: dict[str, int] = {root: 0}
    pred: dict[str, GraphEdge] = {}
    heap: list[tuple[int, str]] = [(0, root)]
    while heap:
        dist, node = heapq.heappop(heap)
        if dist > best.get(node, 1 << 62):
            continue
        for edge in structure.forward.get(node, ()):
            if edge.to_node == root:
                continue
            nd = dist + edge.lag_ms[0]
            known = best.get(edge.to_node)
            if known is None or nd < known or (nd == known and edge.id < pred[edge.to_node].id):
                best[edge.to_node] = nd
                pred[edge.to_node] = edge
                heapq.heappush(heap, (nd, edge.to_node))

    reachable = set(best)

    # Slowest arrival over the condensation DAG (components in reverse Tarjan order = topo order).
    comp_of = structure.component_of
    internal_max: dict[int, int] = {}
    for ci in structure.cyclic_components:
        members = set(structure.components[ci])
        internal_max[ci] = sum(
            e.lag_ms[1]
            for m in members
            for e in structure.forward.get(m, ())
            if e.to_node in members
        )
    topo = list(range(len(structure.components) - 1, -1, -1))
    comp_arrival: dict[int, int] = {comp_of[root]: internal_max.get(comp_of[root], 0)}
    for ci in topo:
        if ci not in comp_arrival:
            continue
        base = comp_arrival[ci]
        for member in structure.components[ci]:
            if member not in reachable:
                continue
            for edge in structure.forward.get(member, ()):
                cj = comp_of[edge.to_node]
                if cj == ci:
                    continue
                arrival = base + edge.lag_ms[1] + internal_max.get(cj, 0)
                if arrival > comp_arrival.get(cj, -1):
                    comp_arrival[cj] = arrival

    reach: dict[str, Reach] = {}
    for node in sorted(reachable):
        if node == root:
            continue
        path: list[GraphEdge] = []
        cursor = node
        while cursor != root:
            edge = pred[cursor]
            path.append(edge)
            cursor = edge.from_node
        path.reverse()
        sign: int | None = 1
        for edge in path:
            s = _polarity_sign(edge)
            if s is None:
                sign = None
                break
            sign *= s
        via_loop = any(comp_of[e.to_node] in structure.cyclic_components for e in path) or (
            comp_of[root] in structure.cyclic_components
        )
        reach[node] = Reach(
            min_ms=best[node],
            max_ms=max(best[node], comp_arrival.get(comp_of[node], best[node])),
            path_edges=tuple(e.id for e in path),
            polarity=sign,
            via_loop=via_loop,
        )
    return reach


_CACHE: OrderedDict[tuple, CausalStructure] = OrderedDict()
_CACHE_SIZE = 16


def _signature(graph_index: dict[str, Any]) -> tuple:
    edges = []
    for edges_in in graph_index.get("reverse_adjacency", {}).values():
        for e in edges_in:
            edges.append((e.id, e.from_node, e.to_node, e.approved, e.lag_ms, e.polarity, e.loop_ok))
    return (tuple(sorted(graph_index.get("nodes", {}))), tuple(sorted(edges)))


def structure_for(graph_index: dict[str, Any]) -> CausalStructure:
    """Cached compiled structure keyed by the approved-edge signature (never mutates input)."""
    key = _signature(graph_index)
    cached = _CACHE.get(key)
    if cached is not None:
        _CACHE.move_to_end(key)
        return cached
    structure = build_structure(graph_index)
    _CACHE[key] = structure
    if len(_CACHE) > _CACHE_SIZE:
        _CACHE.popitem(last=False)
    return structure
