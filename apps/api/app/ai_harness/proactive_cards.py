"""Proactive card generation and in-memory store.

Cards are generated deterministically from runtime tick output.
Role visibility is enforced at query time — operators see operational cards,
engineers see config/quality cards, managers see risk summaries.
Stale data never looks calm.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from threading import Lock
from typing import Any

from app.ai_harness.response_schema import EvidenceRef, ProactiveCard

_CARD_TTL_SECONDS = 300  # 5 min default; pinned cards never expire


class ProactiveCardStore:
    """In-memory store for proactive cards. Thread-safe."""

    def __init__(self) -> None:
        self._cards: dict[str, ProactiveCard] = {}
        self._lock = Lock()

    def upsert(self, card: ProactiveCard) -> None:
        with self._lock:
            existing = self._cards.get(card.card_id)
            if existing and existing.dismissed:
                return  # dismissed cards are not refreshed
            self._cards[card.card_id] = card

    def get_active(self, role: str) -> list[ProactiveCard]:
        now = datetime.now(UTC).isoformat()
        with self._lock:
            return [
                c
                for c in self._cards.values()
                if not c.dismissed
                and role in c.role_visibility
                and (c.expires_at is None or c.expires_at > now)
            ]

    def dismiss(self, card_id: str) -> ProactiveCard | None:
        with self._lock:
            card = self._cards.get(card_id)
            if card:
                self._cards[card_id] = card.model_copy(update={"dismissed": True})
                return self._cards[card_id]
        return None

    def pin(self, card_id: str) -> ProactiveCard | None:
        with self._lock:
            card = self._cards.get(card_id)
            if card:
                self._cards[card_id] = card.model_copy(
                    update={"pinned": True, "expires_at": None}
                )
                return self._cards[card_id]
        return None

    def get(self, card_id: str) -> ProactiveCard | None:
        with self._lock:
            return self._cards.get(card_id)

    def clear(self) -> None:
        with self._lock:
            self._cards.clear()


proactive_card_store = ProactiveCardStore()


def reset_proactive_card_store_for_tests() -> None:
    proactive_card_store.clear()


# ---------------------------------------------------------------------------
# Card generators — called from runtime tick or gateway events
# ---------------------------------------------------------------------------


def _now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _expires_iso(seconds: int = _CARD_TTL_SECONDS) -> str:
    return (datetime.now(UTC) + timedelta(seconds=seconds)).isoformat().replace("+00:00", "Z")


def generate_situation_active_card(
    situation: dict[str, Any], evidence_packet: dict[str, Any] | None
) -> ProactiveCard:
    root_id = situation.get("root_asset_id") or ""
    sit_type = situation.get("situation_type") or "Active Situation"
    card_id = f"CARD_SIT_{situation.get('situation_id', uuid.uuid4().hex[:8])}"
    ep_id = (evidence_packet or {}).get("evidence_id", "")
    alarm_count = len((evidence_packet or {}).get("grouped_alarm_ids", []))

    refs = []
    if ep_id:
        refs.append(EvidenceRef(ref_type="situation", ref_id=ep_id, quote_or_value=sit_type))

    return ProactiveCard(
        card_id=card_id,
        card_type="SITUATION_ACTIVE",
        priority=1,
        title=f"Situation Active: {sit_type.replace('_', ' ').title()}",
        summary=(
            f"Root: {root_id}. "
            f"{alarm_count} alarm(s) grouped. "
            "First check available."
        ),
        evidence_refs=refs,
        target_asset_id=root_id or None,
        role_visibility=["operator", "maintenance", "engineer", "admin", "supervisor"],
        created_at=_now_iso(),
        expires_at=_expires_iso(600),
    )


def generate_root_cause_changed_card(
    old_root: str, new_root: str, evidence_id: str
) -> ProactiveCard:
    card_id = f"CARD_RCC_{uuid.uuid4().hex[:8]}"
    return ProactiveCard(
        card_id=card_id,
        card_type="ROOT_CAUSE_CHANGED",
        priority=2,
        title="Root Cause Re-evaluated",
        summary=(
            f"Root cause changed from {old_root} to {new_root}. "
            "Review updated evidence chain."
        ),
        evidence_refs=[
            EvidenceRef(ref_type="evidence_packet", ref_id=evidence_id, quote_or_value=f"{old_root}→{new_root}")
        ],
        target_asset_id=new_root,
        role_visibility=["engineer", "maintenance", "admin"],
        created_at=_now_iso(),
        expires_at=_expires_iso(300),
    )


def generate_data_quality_card(stale_tags: list[str], bad_tags: list[str]) -> ProactiveCard:
    affected = stale_tags + bad_tags
    card_id = f"CARD_DQ_{uuid.uuid4().hex[:8]}"
    return ProactiveCard(
        card_id=card_id,
        card_type="DATA_QUALITY_DEGRADED",
        priority=2,
        title="Sensor Data Quality Degraded",
        summary=(
            f"{len(affected)} tag(s) are stale or bad: "
            f"{', '.join(affected[:4])}{'...' if len(affected) > 4 else ''}. "
            "Root cause confidence is reduced."
        ),
        evidence_refs=[
            EvidenceRef(ref_type="tag", ref_id=t, quote_or_value="stale_or_bad")
            for t in affected[:5]
        ],
        role_visibility=["operator", "engineer", "maintenance", "admin"],
        created_at=_now_iso(),
        expires_at=_expires_iso(180),
    )


def generate_time_to_consequence_card(
    ttc: dict[str, Any], root_asset_id: str, evidence_id: str
) -> ProactiveCard:
    mid = ttc.get("seconds_mid")
    tag_id = ttc.get("tag_id", "monitored tag")
    mins = int((mid or 0) // 60) if mid else 0
    card_id = f"CARD_TTC_{uuid.uuid4().hex[:8]}"
    return ProactiveCard(
        card_id=card_id,
        card_type="TIME_TO_CONSEQUENCE",
        priority=1,
        title="Time-to-Consequence Warning",
        summary=(
            f"{tag_id} approaching limit on {root_asset_id}. "
            f"Estimated ~{mins} min (advisory). "
            "Act now or acknowledge."
        ),
        evidence_refs=[
            EvidenceRef(ref_type="evidence_packet", ref_id=evidence_id, quote_or_value=f"TTC mid={mid}"),
            EvidenceRef(ref_type="tag", ref_id=tag_id, quote_or_value="approaching_limit"),
        ],
        target_asset_id=root_asset_id,
        role_visibility=["operator", "maintenance", "engineer", "admin"],
        created_at=_now_iso(),
        expires_at=_expires_iso(120),
    )


def generate_agent_draft_card(draft_id: str, draft_summary: str) -> ProactiveCard:
    card_id = f"CARD_DRF_{uuid.uuid4().hex[:8]}"
    return ProactiveCard(
        card_id=card_id,
        card_type="NEW_AGENT_DRAFT_AVAILABLE",
        priority=3,
        title="New Graph Draft Available",
        summary=(
            f"Agent proposed causal edge changes. {draft_summary} "
            "Review in Studio before approving."
        ),
        evidence_refs=[
            EvidenceRef(ref_type="audit", ref_id=draft_id, quote_or_value="graph_draft")
        ],
        role_visibility=["engineer", "admin"],
        created_at=_now_iso(),
        expires_at=_expires_iso(3600),
    )


def generate_compile_failed_card(errors: list[dict[str, Any]]) -> ProactiveCard:
    card_id = f"CARD_CFX_{uuid.uuid4().hex[:8]}"
    first_error = errors[0].get("message", "validation error") if errors else "unknown"
    return ProactiveCard(
        card_id=card_id,
        card_type="GRAPH_COMPILE_FAILED",
        priority=2,
        title="Graph Compile Failed",
        summary=(
            f"{len(errors)} error(s) — bundle not deployed. "
            f"First: {first_error}. Fix in Studio."
        ),
        evidence_refs=[],
        role_visibility=["engineer", "admin"],
        created_at=_now_iso(),
        expires_at=_expires_iso(600),
    )


def generate_gateway_stale_card(gateway_id: str, last_seen_iso: str) -> ProactiveCard:
    card_id = f"CARD_GWS_{uuid.uuid4().hex[:8]}"
    return ProactiveCard(
        card_id=card_id,
        card_type="GATEWAY_STALE",
        priority=2,
        title="Gateway Data Stale",
        summary=(
            f"Gateway '{gateway_id}' has not sent data since {last_seen_iso}. "
            "Plant data may be outdated. Root cause confidence is degraded."
        ),
        evidence_refs=[
            EvidenceRef(ref_type="signal", ref_id=gateway_id, quote_or_value="stale_gateway")
        ],
        role_visibility=["operator", "engineer", "maintenance", "admin"],
        created_at=_now_iso(),
        expires_at=_expires_iso(300),
    )


def generate_role_next_action_card(
    role: str, situation_type: str, recommended_action: dict[str, Any]
) -> ProactiveCard:
    card_id = f"CARD_RNA_{uuid.uuid4().hex[:8]}"
    label = recommended_action.get("label", "Review situation")
    action_id = recommended_action.get("action_id", "")
    return ProactiveCard(
        card_id=card_id,
        card_type="ROLE_SPECIFIC_NEXT_ACTION",
        priority=2,
        title=f"Recommended Action for {role.title()}",
        summary=f"{situation_type}: {label}",
        evidence_refs=[
            EvidenceRef(ref_type="action", ref_id=action_id, quote_or_value=label)
        ],
        role_visibility=[role, "admin"],
        created_at=_now_iso(),
        expires_at=_expires_iso(600),
    )


# ---------------------------------------------------------------------------
# Batch generator — called after each runtime tick
# ---------------------------------------------------------------------------


def update_cards_from_snapshot(snapshot: dict[str, Any]) -> list[ProactiveCard]:
    """Generate all relevant proactive cards from a runtime snapshot.

    Called after each runtime tick. Existing dismissed/pinned cards are preserved.
    Returns newly upserted cards.
    """
    upserted: list[ProactiveCard] = []

    ep = snapshot.get("latest_evidence_packet") or {}
    calm = snapshot.get("latest_calm_card") or {}
    situations = snapshot.get("active_situations") or []
    stale = ep.get("stale_or_bad_tags") or []

    situations_list = (
        list(situations.values()) if isinstance(situations, dict) else list(situations)
    )

    # Situation active card
    for sit in situations_list:
        card = generate_situation_active_card(sit, ep or None)
        proactive_card_store.upsert(card)
        upserted.append(card)

    # Data quality
    if stale:
        card = generate_data_quality_card(stale, [])
        proactive_card_store.upsert(card)
        upserted.append(card)

    # Time to consequence
    ttc = ep.get("time_to_consequence") or calm.get("time_to_consequence")
    if ttc and ttc.get("state") not in (None, "stable", "clearing"):
        root_id = ep.get("root_asset_id") or ""
        ev_id = ep.get("evidence_id", "")
        if root_id and ev_id:
            card = generate_time_to_consequence_card(ttc, root_id, ev_id)
            proactive_card_store.upsert(card)
            upserted.append(card)

    return upserted
