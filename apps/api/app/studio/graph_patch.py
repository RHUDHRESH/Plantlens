"""Graph patch validation, application, and deterministic candidate generation.

Validation runs BEFORE any write to the authored bundle.
Candidate generation is purely deterministic — alarm ordering drives proposals, never fabrication.
"""

from __future__ import annotations

import copy
import hashlib
from dataclasses import dataclass, field
from typing import Any

import networkx as nx

ALLOWED_EDGE_TYPES = frozenset(
    {
        "structural_power",
        "structural_load_effect",
        "signal",
        "thermal",
        "mechanical",
        "control",
        "cause_to_effect",
    }
)

ALLOWED_CHANGE_TYPES = frozenset({"add_causal_edge"})


@dataclass(frozen=True, slots=True)
class PatchError:
    code: str
    message: str
    fix: str
    change_index: int | None = None


@dataclass
class PatchValidationResult:
    valid: bool
    errors: list[PatchError] = field(default_factory=list)
    warnings: list[PatchError] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Candidate generation
# ---------------------------------------------------------------------------


def _parse_iso_ms(ts: str) -> int | None:
    from datetime import datetime

    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return int(dt.timestamp() * 1000)
    except Exception:
        return None


def _estimate_lag_ms(ts1: str | None, ts2: str | None) -> list[int]:
    if not ts1 or not ts2:
        return [0, 5000]
    ms1 = _parse_iso_ms(ts1)
    ms2 = _parse_iso_ms(ts2)
    if ms1 is None or ms2 is None:
        return [0, 5000]
    delta = max(0, ms2 - ms1)
    margin = max(500, delta // 2)
    return [max(0, delta - margin), delta + margin]


def _edge_id_for(from_id: str, to_id: str, evidence_id: str) -> str:
    token = hashlib.sha256(f"{from_id}_{to_id}_{evidence_id}".encode()).hexdigest()[:6].upper()
    return f"E_AGENT_{token}"


def _infer_edge_type(alarm_id: str | None) -> str:
    if alarm_id:
        al = alarm_id.upper()
        if any(k in al for k in ("CURRENT", "RPM", "VIB", "MECH")):
            return "mechanical"
        if any(k in al for k in ("TEMP", "THERMAL")):
            return "thermal"
        if any(k in al for k in ("VOLTAGE", "POWER", "BUS")):
            return "structural_load_effect"
    return "cause_to_effect"


def generate_graph_draft_candidates(
    evidence_packet: dict[str, Any],
    existing_node_ids: set[str],
    existing_edge_pairs: set[tuple[str, str, str]],
) -> list[dict[str, Any]]:
    """Generate deterministic add_causal_edge proposals from a RuntimeEvidencePacket.

    Derives candidates purely from observed alarm ordering — no fabrication.
    All proposed edges are approved=false, provenance=agent_proposed.
    Confidence is capped at 0.75 regardless of source evidence confidence.
    Edges already present in causal_path are not re-proposed.
    """
    chain = evidence_packet.get("evidence_chain", [])
    evidence_id = evidence_packet.get("evidence_id", "UNKNOWN")
    base_confidence = min(0.75, float(evidence_packet.get("confidence", 0.5)) * 0.85)

    first_signals = [item for item in chain if item.get("role") == "first_signal"]
    downstream = [item for item in chain if item.get("role") == "downstream_effect"]

    if not first_signals or not downstream:
        return []

    traversed: set[tuple[str, str]] = {
        (e.get("from_asset_id", ""), e.get("to_asset_id", ""))
        for e in evidence_packet.get("causal_path", [])
    }

    proposals: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()

    for cause_item in first_signals:
        cause_id = cause_item.get("asset_id", "")
        if not cause_id or cause_id not in existing_node_ids:
            continue
        for effect_item in downstream:
            effect_id = effect_item.get("asset_id", "")
            if not effect_id or effect_id not in existing_node_ids:
                continue
            if cause_id == effect_id:
                continue
            if (cause_id, effect_id) in seen:
                continue
            if (cause_id, effect_id) in traversed:
                continue
            seen.add((cause_id, effect_id))

            edge_type = _infer_edge_type(cause_item.get("alarm_id"))
            if (cause_id, effect_id, edge_type) in existing_edge_pairs:
                continue

            lag_ms = _estimate_lag_ms(
                cause_item.get("first_seen_ts"),
                effect_item.get("first_seen_ts"),
            )
            edge_id = _edge_id_for(cause_id, effect_id, evidence_id)
            evidence_refs = [
                a
                for a in [cause_item.get("alarm_id"), effect_item.get("alarm_id")]
                if a
            ]

            proposals.append(
                {
                    "change_type": "add_causal_edge",
                    "target_path": "/causal_graph/edges",
                    "patch": {
                        "id": edge_id,
                        "from": cause_id,
                        "to": effect_id,
                        "edge_type": edge_type,
                        "approved": False,
                        "lag_ms": lag_ms,
                        "weight": round(min(1.0, base_confidence + 0.05), 3),
                        "confidence": round(base_confidence, 3),
                        "provenance": "agent_proposed",
                    },
                    "rationale": (
                        f"{cause_item.get('alarm_id', cause_id)} on {cause_id} observed "
                        f"before {effect_item.get('alarm_id', effect_id)} on {effect_id}. "
                        f"Evidence: {evidence_id}."
                    ),
                    "evidence_refs": evidence_refs,
                    "risk_level": "medium",
                }
            )

    return proposals


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def _would_create_cycle_if_approved(
    existing_edges: list[dict[str, Any]], from_id: str, to_id: str
) -> bool:
    """True if adding from_id→to_id to the approved subgraph would introduce a cycle."""
    g = nx.DiGraph()
    for edge in existing_edges:
        if edge.get("approved"):
            g.add_edge(edge["from"], edge["to"])
    g.add_edge(from_id, to_id)
    return not nx.is_directed_acyclic_graph(g)


def validate_graph_patch(
    bundle: dict[str, Any],
    draft_payload: dict[str, Any],
) -> PatchValidationResult:
    """Validate proposed graph changes against the authored bundle.

    Returns structured errors and warnings. Does NOT modify the bundle.
    """
    errors: list[PatchError] = []
    warnings: list[PatchError] = []

    node_ids = {n["id"] for n in bundle.get("causal_graph", {}).get("nodes", [])}
    existing_edges = bundle.get("causal_graph", {}).get("edges", [])
    existing_edge_pairs: set[tuple[str, str, str]] = {
        (e.get("from", ""), e.get("to", ""), e.get("edge_type", ""))
        for e in existing_edges
    }
    existing_edge_ids: set[str] = {e.get("id", "") for e in existing_edges}

    proposed = draft_payload.get("proposed_changes", [])
    if not isinstance(proposed, list):
        errors.append(
            PatchError(
                code="INVALID_PROPOSED_CHANGES",
                message="proposed_changes must be a list.",
                fix="Provide a list of change objects.",
            )
        )
        return PatchValidationResult(valid=False, errors=errors)

    for i, change in enumerate(proposed):
        change_type = change.get("change_type")
        if change_type not in ALLOWED_CHANGE_TYPES:
            errors.append(
                PatchError(
                    code="UNSUPPORTED_CHANGE_TYPE",
                    message=f"Change {i}: change_type '{change_type}' is not allowed.",
                    fix=f"Allowed types: {sorted(ALLOWED_CHANGE_TYPES)}",
                    change_index=i,
                )
            )
            continue

        patch = change.get("patch", {})
        from_id = patch.get("from", "")
        to_id = patch.get("to", "")
        edge_type = patch.get("edge_type", "")
        edge_id = patch.get("id", "")

        if from_id not in node_ids:
            errors.append(
                PatchError(
                    code="UNKNOWN_FROM_NODE",
                    message=f"Change {i}: from node '{from_id}' does not exist in causal_graph.nodes.",
                    fix="Use an existing node id or add the node first.",
                    change_index=i,
                )
            )
        if to_id not in node_ids:
            errors.append(
                PatchError(
                    code="UNKNOWN_TO_NODE",
                    message=f"Change {i}: to node '{to_id}' does not exist in causal_graph.nodes.",
                    fix="Use an existing node id or add the node first.",
                    change_index=i,
                )
            )
        if from_id and from_id == to_id:
            errors.append(
                PatchError(
                    code="SELF_LOOP",
                    message=f"Change {i}: self-loop — from and to are both '{from_id}'.",
                    fix="from and to must be different nodes.",
                    change_index=i,
                )
            )
        if edge_type not in ALLOWED_EDGE_TYPES:
            errors.append(
                PatchError(
                    code="INVALID_EDGE_TYPE",
                    message=f"Change {i}: edge_type '{edge_type}' is not in the allowed enum.",
                    fix=f"Allowed edge types: {sorted(ALLOWED_EDGE_TYPES)}",
                    change_index=i,
                )
            )
        if (from_id, to_id, edge_type) in existing_edge_pairs:
            errors.append(
                PatchError(
                    code="DUPLICATE_EDGE",
                    message=f"Change {i}: edge {from_id}→{to_id} (type={edge_type}) already exists.",
                    fix="Do not re-propose an existing edge.",
                    change_index=i,
                )
            )
        if edge_id and edge_id in existing_edge_ids:
            errors.append(
                PatchError(
                    code="DUPLICATE_EDGE_ID",
                    message=f"Change {i}: edge id '{edge_id}' is already used.",
                    fix="Use a unique edge id.",
                    change_index=i,
                )
            )
        if patch.get("approved") is not False:
            errors.append(
                PatchError(
                    code="AGENT_EDGE_MUST_BE_UNAPPROVED",
                    message=f"Change {i}: agent-proposed edges must have approved=false.",
                    fix="Set patch.approved to false. Runtime approval is a separate human action.",
                    change_index=i,
                )
            )
        if patch.get("provenance") != "agent_proposed":
            errors.append(
                PatchError(
                    code="INVALID_PROVENANCE",
                    message=f"Change {i}: agent draft edges must have provenance='agent_proposed'.",
                    fix="Set patch.provenance to 'agent_proposed'.",
                    change_index=i,
                )
            )
        lag_ms = patch.get("lag_ms", [])
        if not isinstance(lag_ms, list) or len(lag_ms) != 2:
            errors.append(
                PatchError(
                    code="INVALID_LAG_MS",
                    message=f"Change {i}: lag_ms must be [min_ms, max_ms].",
                    fix="Provide lag_ms as a two-element list with both values >= 0.",
                    change_index=i,
                )
            )
        elif lag_ms[0] < 0 or lag_ms[1] < 0 or lag_ms[0] > lag_ms[1]:
            errors.append(
                PatchError(
                    code="INVALID_LAG_MS_RANGE",
                    message=f"Change {i}: lag_ms {lag_ms} is invalid — must be [min, max] with min <= max and both >= 0.",
                    fix="Set lag_ms[0] <= lag_ms[1] and both non-negative.",
                    change_index=i,
                )
            )
        if not change.get("evidence_refs"):
            errors.append(
                PatchError(
                    code="MISSING_EVIDENCE_REFS",
                    message=f"Change {i}: evidence_refs must be a non-empty list.",
                    fix="Cite at least one alarm_id or tag_id that supports this edge proposal.",
                    change_index=i,
                )
            )

        if (
            from_id
            and to_id
            and from_id in node_ids
            and to_id in node_ids
            and from_id != to_id
        ):
            if _would_create_cycle_if_approved(existing_edges, from_id, to_id):
                errors.append(
                    PatchError(
                        code="WOULD_CREATE_CYCLE",
                        message=f"Change {i}: approving edge {from_id}→{to_id} would create a cycle.",
                        fix="Remove or reverse one of the edges in the cycle chain.",
                        change_index=i,
                    )
                )

    return PatchValidationResult(valid=not errors, errors=errors, warnings=warnings)


# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------


def apply_graph_patch(
    bundle: dict[str, Any],
    draft_payload: dict[str, Any],
) -> dict[str, Any]:
    """Apply validated proposed_changes to a deep copy of the bundle.

    Caller MUST call validate_graph_patch first and check result.valid == True.
    Returns a new bundle with edges added (all approved=false).
    """
    new_bundle = copy.deepcopy(bundle)
    for change in draft_payload.get("proposed_changes", []):
        if change.get("change_type") == "add_causal_edge":
            new_bundle["causal_graph"]["edges"].append(copy.deepcopy(change["patch"]))
    return new_bundle
