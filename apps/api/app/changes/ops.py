"""Typed, id-addressed change operations on an authored plant bundle.

Every proposed change to what the runtime believes (causal graph, alarm rules) is
expressed as a ``ChangeSet`` of these operations, never as free-form JSON patches.
That gives one allow-list for agents, the pattern library and Studio drafts (R5), and
makes diffs reviewable per entity. Applying a change set is pure: it returns a new bundle
and never touches the input.
"""

from __future__ import annotations

import copy
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# Fields a change set may modify on existing entities. Anything else is rejected.
EDITABLE_EDGE_FIELDS = frozenset(
    {"approved", "lag_ms", "weight", "confidence", "polarity", "loop_ok", "loop_id", "edge_type"}
)
EDITABLE_ALARM_FIELDS = frozenset(
    {"severity", "priority", "condition", "deadband", "delay_ms", "message", "latching", "requires_ack"}
)
MERGEABLE_NODE_LIST_FIELDS = ("evidence_tags", "expected_symptoms")
APPENDABLE_NODE_RULE_FIELDS = ("fingerprint_rules", "score_adjustments")


class _Op(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rationale: str | None = None


class AddEdge(_Op):
    op: Literal["add_edge"] = "add_edge"
    edge: dict[str, Any]


class UpdateEdge(_Op):
    op: Literal["update_edge"] = "update_edge"
    edge_id: str
    fields: dict[str, Any]


class RemoveEdge(_Op):
    op: Literal["remove_edge"] = "remove_edge"
    edge_id: str


class UpsertNode(_Op):
    """Create a node or merge into an existing one (lists are unioned, rules appended)."""

    op: Literal["upsert_node"] = "upsert_node"
    node: dict[str, Any]


class AddRootCauseRule(_Op):
    op: Literal["add_root_cause_rule"] = "add_root_cause_rule"
    rule: dict[str, Any]


class AddSituationType(_Op):
    op: Literal["add_situation_type"] = "add_situation_type"
    situation_type: dict[str, Any]


class AddAlarmRule(_Op):
    op: Literal["add_alarm_rule"] = "add_alarm_rule"
    rule: dict[str, Any]


class UpdateAlarmRule(_Op):
    op: Literal["update_alarm_rule"] = "update_alarm_rule"
    rule_id: str
    fields: dict[str, Any]


ChangeOp = Annotated[
    AddEdge
    | UpdateEdge
    | RemoveEdge
    | UpsertNode
    | AddRootCauseRule
    | AddSituationType
    | AddAlarmRule
    | UpdateAlarmRule,
    Field(discriminator="op"),
]


class ChangeSet(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    summary: str = ""
    source: Literal["agent", "pattern_library", "studio", "engineer"]
    source_ref: str | None = None  # e.g. pattern_id@version or agent draft id
    ops: list[ChangeOp]


class ChangeSetError(ValueError):
    """A change set cannot be applied to the given bundle."""


Bundle = dict[str, Any]  # {"causal_graph": {...}, "alarm_rules": {...}, ...}


def _index(items: list[dict[str, Any]], key: str = "id") -> dict[str, int]:
    return {item[key]: i for i, item in enumerate(items)}


def _merge_node(existing: dict[str, Any], incoming: dict[str, Any]) -> None:
    for field_name in MERGEABLE_NODE_LIST_FIELDS:
        if field_name in incoming:
            merged = list(existing.get(field_name, []))
            for value in incoming[field_name]:
                if value not in merged:
                    merged.append(value)
            existing[field_name] = merged
    for field_name in APPENDABLE_NODE_RULE_FIELDS:
        if field_name in incoming:
            current = list(existing.get(field_name, []))
            for rule in incoming[field_name]:
                if rule not in current:
                    current.append(rule)
            existing[field_name] = current
    for field_name in ("label", "prior"):
        if field_name in incoming and field_name not in existing:
            existing[field_name] = incoming[field_name]


def apply_change_set(bundle: Bundle, change_set: ChangeSet, *, approve_edges: bool = False) -> Bundle:
    """Return a new bundle with ``change_set`` applied.

    ``approve_edges`` is the reviewer's explicit decision: only then do edges added or
    updated by this change set become ``approved: true``. Proposers can never set it.
    """
    out = copy.deepcopy(bundle)
    graph = out.setdefault("causal_graph", {"nodes": [], "edges": []})
    graph.setdefault("nodes", [])
    graph.setdefault("edges", [])
    rules_doc = out.setdefault("alarm_rules", {"rules": []})
    rules_doc.setdefault("rules", [])
    touched_edges: set[str] = set()

    for op in change_set.ops:
        if isinstance(op, AddEdge):
            edge = dict(op.edge)
            if edge.get("id") in _index(graph["edges"]):
                raise ChangeSetError(f"add_edge: edge {edge.get('id')} already exists")
            # Proposals are always drafts; approval is the reviewer's call below.
            edge["approved"] = False
            graph["edges"].append(edge)
            touched_edges.add(edge["id"])
        elif isinstance(op, UpdateEdge):
            idx = _index(graph["edges"]).get(op.edge_id)
            if idx is None:
                raise ChangeSetError(f"update_edge: unknown edge {op.edge_id}")
            illegal = set(op.fields) - EDITABLE_EDGE_FIELDS
            if illegal:
                raise ChangeSetError(f"update_edge: fields not editable: {sorted(illegal)}")
            fields = dict(op.fields)
            if fields.get("approved") is True:
                fields.pop("approved")  # approval only via reviewer decision
                touched_edges.add(op.edge_id)
            graph["edges"][idx].update(fields)
        elif isinstance(op, RemoveEdge):
            idx = _index(graph["edges"]).get(op.edge_id)
            if idx is None:
                raise ChangeSetError(f"remove_edge: unknown edge {op.edge_id}")
            graph["edges"].pop(idx)
        elif isinstance(op, UpsertNode):
            node_id = op.node.get("id")
            if not node_id:
                raise ChangeSetError("upsert_node: node.id required")
            idx = _index(graph["nodes"]).get(node_id)
            if idx is None:
                graph["nodes"].append({"kind": "asset", **copy.deepcopy(op.node)})
            else:
                _merge_node(graph["nodes"][idx], op.node)
        elif isinstance(op, AddRootCauseRule):
            rules = graph.setdefault("root_cause_rules", [])
            if op.rule not in rules:
                rules.append(copy.deepcopy(op.rule))
        elif isinstance(op, AddSituationType):
            specs = graph.setdefault("situation_types", [])
            if op.situation_type.get("id") in _index(specs):
                raise ChangeSetError(f"add_situation_type: {op.situation_type.get('id')} already exists")
            specs.append(copy.deepcopy(op.situation_type))
        elif isinstance(op, AddAlarmRule):
            if op.rule.get("id") in _index(rules_doc["rules"]):
                raise ChangeSetError(f"add_alarm_rule: {op.rule.get('id')} already exists")
            rules_doc["rules"].append(copy.deepcopy(op.rule))
        elif isinstance(op, UpdateAlarmRule):
            idx = _index(rules_doc["rules"]).get(op.rule_id)
            if idx is None:
                raise ChangeSetError(f"update_alarm_rule: unknown rule {op.rule_id}")
            illegal = set(op.fields) - EDITABLE_ALARM_FIELDS
            if illegal:
                raise ChangeSetError(f"update_alarm_rule: fields not editable: {sorted(illegal)}")
            rules_doc["rules"][idx].update(copy.deepcopy(op.fields))

    if approve_edges:
        for edge in graph["edges"]:
            if edge["id"] in touched_edges:
                edge["approved"] = True
    return out
