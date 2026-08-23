"""Build compact, deterministic AIContext from runtime state.

Never passes raw unlimited state to agents.
Only includes what is needed to answer evidence-grounded questions.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.ai_harness.intents import Intent
from app.ai_harness.role_policy import get_allowed_intents


@dataclass
class AIContext:
    plant_id: str
    role: str
    active_situation: dict[str, Any] | None
    latest_evidence_packet: dict[str, Any] | None
    calm_card: dict[str, Any] | None
    active_alarms: list[dict[str, Any]]
    rejected_candidates: list[dict[str, Any]]
    causal_path: list[dict[str, Any]]
    action_envelope: dict[str, Any]
    graph_edges: list[dict[str, Any]]
    stale_or_bad_tags: list[str]
    allowed_intents: frozenset[Intent]
    known_asset_ids: set[str] = field(default_factory=set)
    known_alarm_ids: set[str] = field(default_factory=set)
    known_tag_ids: set[str] = field(default_factory=set)
    known_edge_ids: set[str] = field(default_factory=set)
    valid_action_ids: set[str] = field(default_factory=set)


def build_context(
    *,
    role: str,
    snapshot: dict[str, Any],
    compiled_bundle: dict[str, Any] | None = None,
) -> AIContext:
    """Build compact AIContext from runtime snapshot + compiled bundle.

    snapshot = runtime_state.snapshot()
    compiled_bundle = load_compiled(...) result from config_store
    """
    ep = snapshot.get("latest_evidence_packet") or {}
    calm = snapshot.get("latest_calm_card") or {}

    active_situations = snapshot.get("active_situations") or []
    active_situation = active_situations[0] if active_situations else None

    active_alarms_raw = snapshot.get("active_alarms") or []
    active_alarms: list[dict[str, Any]] = (
        list(active_alarms_raw.values())
        if isinstance(active_alarms_raw, dict)
        else list(active_alarms_raw)
    )

    rejected = ep.get("rejected_candidates", [])
    causal_path = ep.get("causal_path", [])
    stale_tags = ep.get("stale_or_bad_tags", [])

    # Pull from compiled bundle when available
    graph_edges: list[dict[str, Any]] = []
    action_envelope: dict[str, Any] = {}
    known_asset_ids: set[str] = set()
    known_alarm_ids: set[str] = set()
    known_tag_ids: set[str] = set()
    known_edge_ids: set[str] = set()
    valid_action_ids: set[str] = set()
    plant_id = ep.get("plant_id", "unknown")

    if compiled_bundle:
        asset_index = compiled_bundle.get("asset_index") or {}
        alarm_index = compiled_bundle.get("alarm_index") or {}
        tag_index = compiled_bundle.get("tag_index") or {}
        graph_index = compiled_bundle.get("graph_index") or {}
        known_asset_ids = set(asset_index.keys())
        known_alarm_ids = set(alarm_index.keys())
        known_tag_ids = set(tag_index.keys())
        approved_edges = graph_index.get("approved_edges") or []
        graph_edges = list(approved_edges)
        known_edge_ids = {e.get("id", "") for e in graph_edges}
        plant_id = compiled_bundle.get("plant_id", plant_id)

    # Extract action envelope from calm card or compiled bundle
    # (action_envelope is not in compiled_hmi.json so we pass it separately)
    for action in calm.get("blocked_actions", []):
        valid_action_ids.add(action.get("action_id", ""))
    if calm.get("recommended_first_check"):
        rec = calm["recommended_first_check"]
        if isinstance(rec, dict):
            valid_action_ids.add(rec.get("action_id", ""))

    return AIContext(
        plant_id=plant_id,
        role=role,
        active_situation=active_situation,
        latest_evidence_packet=ep or None,
        calm_card=calm or None,
        active_alarms=active_alarms,
        rejected_candidates=rejected,
        causal_path=causal_path,
        action_envelope=action_envelope,
        graph_edges=graph_edges,
        stale_or_bad_tags=stale_tags,
        allowed_intents=get_allowed_intents(role),
        known_asset_ids=known_asset_ids,
        known_alarm_ids=known_alarm_ids,
        known_tag_ids=known_tag_ids,
        known_edge_ids=known_edge_ids,
        valid_action_ids=valid_action_ids,
    )
