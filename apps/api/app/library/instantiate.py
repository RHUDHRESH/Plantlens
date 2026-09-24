"""Bind a causal pattern to a concrete asset and produce a DRAFT change set.

Nothing here touches the runtime. The output is a ``ChangeSet`` whose edges are unapproved
(``provenance: pattern_library``) plus draft alarm/fingerprint rules. An engineer reviews
and approves it through the change pipeline (R2/R5). When a required signal role cannot be
bound, no change set is produced; the result is an observability-gap report instead.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from app.changes.ops import (
    AddAlarmRule,
    AddEdge,
    AddSituationType,
    ChangeOp,
    ChangeSet,
    UpsertNode,
)

# Plant connection kinds → relation vocabulary used by pattern propagation rules.
POWER_KINDS = {"power", "electrical", "dc_power", "ac_power"}
MECHANICAL_KINDS = {"mechanical", "shaft", "coupling", "belt"}
PROCESS_KINDS = {"process", "fluid", "air", "flow", "pipe", "duct"}
CONTROL_KINDS = {"control", "signal", "data"}

# Symptoms slower than this (e.g. winding temperature over 30 min) are evidence, but are not
# listed as expected_symptoms: the engine would otherwise count them missing too early.
EXPECTED_SYMPTOM_MAX_LAG_MS = 10_000

RISE_DIRECTIONS = {"rise"}
FALL_DIRECTIONS = {"fall"}

# Asset meta keys that may carry a role's nominal (rated) value.
NOMINAL_KEYS = {
    "current": ("rated_current_a", "fla_a", "nominal_current_a"),
    "voltage": ("rated_voltage_v", "nominal_voltage_v"),
    "speed": ("rated_speed_rpm", "nominal_speed_rpm"),
    "power": ("rated_power_kw", "rated_power_w"),
    "torque": ("rated_torque_nm",),
}


@dataclass
class RoleBinding:
    role: str
    tag_id: str | None
    method: str  # explicit | tag_map_role | signal_type | name_hint | unbound | ambiguous
    candidates: list[str] = field(default_factory=list)


@dataclass
class InstantiationResult:
    pattern_id: str
    pattern_version: str
    asset_id: str
    ok: bool
    bindings: dict[str, RoleBinding]
    missing_required: list[str]
    missing_optional: list[str]
    neighbours: dict[str, list[str]]
    change_set: ChangeSet | None
    unresolved: list[str]
    notes: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "pattern_id": self.pattern_id,
            "pattern_version": self.pattern_version,
            "asset_id": self.asset_id,
            "ok": self.ok,
            "bindings": {
                role: {"tag_id": b.tag_id, "method": b.method, "candidates": b.candidates}
                for role, b in self.bindings.items()
            },
            "missing_required": self.missing_required,
            "missing_optional": self.missing_optional,
            "neighbours": self.neighbours,
            "change_set": self.change_set.model_dump(mode="json") if self.change_set else None,
            "unresolved": self.unresolved,
            "notes": self.notes,
        }


class PatternInstantiationError(ValueError):
    pass


def _norm_unit(unit: str) -> str:
    return unit.strip().lower().replace("°", "").replace("ω", "ohm")


def _slug(value: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "_", value.upper()).strip("_")


def bind_roles(
    roles: list[str],
    role_defs: dict[str, dict[str, Any]],
    asset_tags: list[dict[str, Any]],
    explicit: dict[str, str] | None = None,
) -> dict[str, RoleBinding]:
    """Deterministically bind roles to this asset's tags. Ties are reported, never guessed."""
    explicit = explicit or {}
    tag_ids = {t["tag"] for t in asset_tags}
    bindings: dict[str, RoleBinding] = {}
    used: set[str] = set()

    for role, tag in explicit.items():
        if role in roles:
            if tag not in tag_ids:
                raise PatternInstantiationError(f"explicit binding {role} → {tag}: tag not on this asset")
            bindings[role] = RoleBinding(role, tag, "explicit")
            used.add(tag)

    for entry in asset_tags:
        role = entry.get("role")
        if role in roles and role not in bindings and entry["tag"] not in used:
            bindings[role] = RoleBinding(role, entry["tag"], "tag_map_role")
            used.add(entry["tag"])

    # Tags that declare a role are reserved for that role.
    reserved = {t["tag"] for t in asset_tags if t.get("role")}

    def specificity(role: str) -> int:
        prefixes = role_defs.get(role, {}).get("signal_type_prefixes", [])
        return max((len(p) for p in prefixes), default=0)

    for role in sorted((r for r in roles if r not in bindings), key=lambda r: (-specificity(r), r)):
        definition = role_defs.get(role, {})
        units = {_norm_unit(u) for u in definition.get("units", [])}
        scored: list[tuple[int, str, str]] = []
        for entry in asset_tags:
            tag = entry["tag"]
            if tag in used or tag in reserved:
                continue
            if units and _norm_unit(str(entry.get("unit", ""))) not in units:
                continue
            signal_type = entry.get("signal_type") or ""
            best = 0
            method = ""
            for prefix in definition.get("signal_type_prefixes", []):
                if signal_type == prefix or signal_type.startswith(prefix + "."):
                    if len(prefix) + 100 > best:
                        best, method = len(prefix) + 100, "signal_type"
            if not best:
                for hint in definition.get("name_hints", []):
                    if hint.lower() in tag.lower():
                        best, method = 1, "name_hint"
                        break
            if best:
                scored.append((best, tag, method))
        if not scored:
            bindings[role] = RoleBinding(role, None, "unbound")
            continue
        top = max(s[0] for s in scored)
        winners = sorted(s for s in scored if s[0] == top)
        if len(winners) > 1:
            bindings[role] = RoleBinding(role, None, "ambiguous", [w[1] for w in winners])
            continue
        bindings[role] = RoleBinding(role, winners[0][1], winners[0][2])
        used.add(winners[0][1])
    return bindings


def resolve_neighbours(plant: dict[str, Any], asset_id: str) -> dict[str, list[str]]:
    """Map relation names to neighbour asset ids from plant.json connections."""
    assets = {a["id"]: a for a in plant.get("assets", [])}
    upstream_power: dict[str, list[str]] = {}
    downstream_power: dict[str, list[str]] = {}
    out: dict[str, set[str]] = {}

    def add(rel: str, node: str) -> None:
        out.setdefault(rel, set()).add(node)

    for conn in plant.get("connections", []):
        kind = str(conn.get("kind", "power")).lower()
        a, b = conn.get("from"), conn.get("to")
        if kind in POWER_KINDS:
            upstream_power.setdefault(b, []).append(a)
            downstream_power.setdefault(a, []).append(b)
        if a == asset_id:
            if kind in MECHANICAL_KINDS:
                add("driven_equipment", b)
            elif kind in PROCESS_KINDS:
                add("process_downstream", b)
            elif kind in CONTROL_KINDS:
                add("controlled", b)
        if b == asset_id:
            if kind in MECHANICAL_KINDS:
                add("driver", a)
            elif kind in PROCESS_KINDS:
                add("process_upstream", a)
            elif kind in CONTROL_KINDS:
                add("controller", a)

    def is_drive(node: str) -> bool:
        return str(assets.get(node, {}).get("type", "")).startswith("drive.")

    for parent in upstream_power.get(asset_id, []):
        if is_drive(parent):
            add("driver", parent)
            # The supply sits behind the drive (drive input side).
            for grand in upstream_power.get(parent, []):
                add("upstream_supply", grand)
        else:
            add("upstream_supply", parent)
    for child in downstream_power.get(asset_id, []):
        add("downstream_load", child)
        if is_drive(asset_id):
            add("controlled", child)

    return {rel: sorted(nodes) for rel, nodes in sorted(out.items())}


def _nominal(asset: dict[str, Any], role: str) -> float | None:
    meta = asset.get("meta") or {}
    for key in NOMINAL_KEYS.get(role, ()):
        if isinstance(meta.get(key), (int, float)):
            return float(meta[key])
    return None


def _existing_rule(rules: list[dict[str, Any]], tag: str, direction: str) -> dict[str, Any] | None:
    for rule in rules:
        if rule.get("tag") != tag:
            continue
        op = (rule.get("condition") or {}).get("op")
        if direction in RISE_DIRECTIONS and op in {">", ">="}:
            return rule
        if direction in FALL_DIRECTIONS and op in {"<", "<="}:
            return rule
        if direction == "trip" and op == "bool_true":
            return rule
    return None


def instantiate_pattern(
    pattern: dict[str, Any],
    library: dict[str, Any],
    *,
    asset_id: str,
    plant: dict[str, Any],
    tag_map: dict[str, Any],
    causal_graph: dict[str, Any],
    alarm_rules: dict[str, Any],
    bindings: dict[str, str] | None = None,
    neighbours: dict[str, list[str]] | None = None,
) -> InstantiationResult:
    assets = {a["id"]: a for a in plant.get("assets", [])}
    asset = assets.get(asset_id)
    if asset is None:
        raise PatternInstantiationError(f"unknown asset {asset_id}")

    role_defs = {r["role"]: r for r in library.get("roles", [])}
    required = list(pattern["required_roles"])
    optional = [r for r in pattern.get("optional_roles", []) if r not in required]
    symptom_roles = [s["role"] for s in pattern["symptoms"]]
    all_roles = list(dict.fromkeys(required + optional + symptom_roles))
    asset_tags = [t for t in tag_map.get("tags", []) if t.get("asset_id") == asset_id]
    bound = bind_roles(all_roles, role_defs, asset_tags, bindings)

    missing_required = [r for r in required if bound[r].tag_id is None]
    missing_optional = [r for r in all_roles if r not in required and bound[r].tag_id is None]
    rels = neighbours if neighbours is not None else resolve_neighbours(plant, asset_id)
    unresolved: list[str] = []
    notes: list[str] = []
    for role in all_roles:
        if bound[role].method == "ambiguous":
            unresolved.append(
                f"Role '{role}' matches several tags {bound[role].candidates}: set tag_map role or pass a binding"
            )

    if missing_required:
        return InstantiationResult(
            pattern_id=pattern["pattern_id"],
            pattern_version=pattern["version"],
            asset_id=asset_id,
            ok=False,
            bindings=bound,
            missing_required=missing_required,
            missing_optional=missing_optional,
            neighbours=rels,
            change_set=None,
            unresolved=unresolved,
            notes=[f"Cannot observe required role(s) {missing_required}: add instrumentation or bind tags."],
        )

    ops: list[ChangeOp] = []
    pattern_ref = f"{pattern['pattern_id']}@{pattern['version']}"
    existing_rules = list(alarm_rules.get("rules", []))
    rule_ids = {r["id"] for r in existing_rules}
    symptom_alarm: dict[str, str] = {}

    # 1) Alarm rules for bound symptoms (reuse an existing rule on the same tag/direction).
    for symptom in sorted(pattern["symptoms"], key=lambda s: (s["onset_lag_ms"][0], s["role"])):
        role = symptom["role"]
        tag = bound[role].tag_id
        if tag is None:
            continue
        direction = symptom["direction"]
        existing = _existing_rule(existing_rules, tag, direction)
        if existing is not None:
            symptom_alarm[role] = existing["id"]
            continue
        if direction not in RISE_DIRECTIONS | FALL_DIRECTIONS | {"trip"}:
            notes.append(f"Symptom {role} ({direction}) is trend/spectral evidence; no threshold alarm drafted.")
            continue
        hint = symptom.get("threshold_hint") or {}
        threshold: float | None = None
        if direction != "trip":
            if "absolute" in hint:
                threshold = float(hint["absolute"])
            elif "relative_to_nominal" in hint:
                nominal = _nominal(asset, role)
                if nominal is not None:
                    threshold = round(nominal * float(hint["relative_to_nominal"]), 3)
            if threshold is None:
                unresolved.append(
                    f"Alarm for {role} ({direction}) on {tag} needs an engineer threshold"
                    + (f" (hint: {hint['relative_to_nominal']}× nominal)" if "relative_to_nominal" in hint else "")
                )
                continue
        suffix = {"rise": "HIGH", "fall": "LOW", "trip": "TRIP"}[direction]
        alarm_id = f"{_slug(asset_id)}_{_slug(role)}_{suffix}"
        if alarm_id in rule_ids:
            symptom_alarm[role] = alarm_id
            continue
        condition: dict[str, Any] = (
            {"op": "bool_true"}
            if direction == "trip"
            else {"op": ">" if direction == "rise" else "<", "threshold": threshold}
        )
        if hint.get("for_ms"):
            condition["for_ms"] = int(hint["for_ms"])
        rule = {
            "id": alarm_id,
            "tag": tag,
            "asset_id": asset_id,
            "severity": pattern["severity"] if role == pattern["trigger_role"] else "warning",
            "condition": condition,
            "message": f"{asset.get('display_name', asset_id)}: {role.replace('_', ' ')} {suffix.lower()}",
        }
        ops.append(AddAlarmRule(rule=rule, rationale=f"{pattern_ref} symptom {role} {direction}"))
        rule_ids.add(alarm_id)
        symptom_alarm[role] = alarm_id

    # 2) Node evidence, expected symptoms and a first-out fingerprint rule.
    evidence_tags = [bound[r].tag_id for r in all_roles if bound[r].tag_id]
    strong = [
        symptom_alarm[s["role"]]
        for s in pattern["symptoms"]
        if s["role"] in symptom_alarm
        and s["weight"] >= 0.6
        and s["onset_lag_ms"][1] <= EXPECTED_SYMPTOM_MAX_LAG_MS
    ]
    node: dict[str, Any] = {"id": asset_id, "evidence_tags": evidence_tags}
    if strong:
        node["expected_symptoms"] = list(dict.fromkeys(strong))
    trigger_alarm = symptom_alarm.get(pattern["trigger_role"])
    followers = [
        symptom_alarm[s["role"]]
        for s in sorted(pattern["symptoms"], key=lambda s: -s["weight"])
        if s["role"] != pattern["trigger_role"] and s["role"] in symptom_alarm
    ]
    if trigger_alarm and followers:
        node["fingerprint_rules"] = [
            {
                "conditions": [
                    {"type": "alarms_all", "alarm_ids": [trigger_alarm, followers[0]]},
                    {"type": "alarm_before", "first": trigger_alarm, "second": followers[0]},
                ],
                "score_bonus": 0.3,
                "reason": f"{pattern['title']}: {pattern['trigger_role']} led {followers[0]} ({pattern_ref})",
            }
        ]
    elif trigger_alarm:
        node["fingerprint_rules"] = [
            {
                "conditions": [{"type": "alarms_any", "alarm_ids": [trigger_alarm]}],
                "score_bonus": 0.15,
                "reason": f"{pattern['title']}: trigger present ({pattern_ref})",
            }
        ]
    ops.append(UpsertNode(node=node, rationale=f"Evidence for {pattern_ref}"))

    # 3) Propagation edges to neighbours (unapproved drafts; skip ones already modelled).
    graph_nodes = {n["id"] for n in causal_graph.get("nodes", [])}
    existing_pairs = {(e["from"], e["to"]): e["id"] for e in causal_graph.get("edges", [])}
    edge_ids = {e["id"] for e in causal_graph.get("edges", [])}
    for rule in pattern.get("propagation", []):
        targets = rels.get(rule["relation"], [])
        if not targets:
            notes.append(f"No '{rule['relation']}' neighbour found for {asset_id}; propagation {rule['effect_role']} skipped.")
            continue
        for target in targets:
            if (asset_id, target) in existing_pairs:
                notes.append(
                    f"Relation {asset_id} → {target} already modelled by edge {existing_pairs[(asset_id, target)]}."
                )
                continue
            if target not in graph_nodes:
                ops.append(UpsertNode(node={"id": target, "evidence_tags": []}, rationale="Propagation target"))
                graph_nodes.add(target)
            edge_id = f"PL-{asset_id}-{target}"
            if edge_id in edge_ids:
                continue
            edge = {
                "id": edge_id,
                "from": asset_id,
                "to": target,
                "edge_type": rule["edge_type"],
                "approved": False,
                "lag_ms": list(rule["lag_ms"]),
                "polarity": rule["polarity"],
                "weight": 0.8,
                "confidence": 0.7,
                "provenance": "pattern_library",
            }
            if rule.get("loop_ok"):
                edge["loop_ok"] = True
                edge["loop_id"] = rule.get("loop_id", "")
            ops.append(AddEdge(edge=edge, rationale=f"{pattern_ref}: {rule.get('note', rule['effect_role'])}"))
            existing_pairs[(asset_id, target)] = edge_id
            edge_ids.add(edge_id)

    # 4) A situation type so the runtime can name this failure mode (fail-closed matching).
    situation_id = f"{_slug(asset_id)}_{_slug(pattern['failure_mode'])}"
    existing_situations = {s["id"] for s in causal_graph.get("situation_types", [])}
    if trigger_alarm and situation_id not in existing_situations:
        ordered = [
            symptom_alarm[s["role"]]
            for s in sorted(pattern["symptoms"], key=lambda s: (s["onset_lag_ms"][0], -s["weight"]))
            if s["role"] in symptom_alarm
        ]
        spec: dict[str, Any] = {
            "id": situation_id,
            "title": f"{pattern['title']}",
            "root_asset_id": asset_id,
            "required_alarms": [trigger_alarm],
            "require_all_alarms": True,
            "evidence_order": list(dict.fromkeys(ordered)),
            "min_root_score": 0.3,
        }
        if pattern.get("description"):
            spec["why_it_matters"] = pattern["description"]
        ops.append(AddSituationType(situation_type=spec, rationale=pattern_ref))

    change_set = ChangeSet(
        title=f"{pattern['title']} on {asset.get('display_name', asset_id)}",
        summary=(
            f"Instantiated {pattern_ref} for {asset_id}. {len(ops)} proposed change(s); "
            "all edges are unapproved until an engineer approves this change set."
        ),
        source="pattern_library",
        source_ref=pattern_ref,
        ops=ops,
    )
    return InstantiationResult(
        pattern_id=pattern["pattern_id"],
        pattern_version=pattern["version"],
        asset_id=asset_id,
        ok=True,
        bindings=bound,
        missing_required=[],
        missing_optional=missing_optional,
        neighbours=rels,
        change_set=change_set,
        unresolved=unresolved,
        notes=notes,
    )
