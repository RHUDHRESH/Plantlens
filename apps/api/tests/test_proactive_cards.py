"""Test proactive card generation and store."""

from __future__ import annotations

from app.ai_harness.proactive_cards import (
    ProactiveCardStore,
    generate_agent_draft_card,
    generate_compile_failed_card,
    generate_data_quality_card,
    generate_gateway_stale_card,
    generate_role_next_action_card,
    generate_situation_active_card,
    generate_time_to_consequence_card,
    update_cards_from_snapshot,
)
from app.ai_harness.response_schema import ProactiveCard


def _situation() -> dict:
    return {
        "situation_id": "SIT_TEST_001",
        "root_asset_id": "MTR-301",
        "situation_type": "MOTOR_MECHANICAL_OVERLOAD",
    }


def _ep(ttc: dict | None = None, stale: list | None = None) -> dict:
    return {
        "evidence_id": "EV_CARD_001",
        "root_asset_id": "MTR-301",
        "grouped_alarm_ids": ["MOTOR_CURRENT_HIGH", "DC_BUS_LOW"],
        "stale_or_bad_tags": stale or [],
        "time_to_consequence": ttc,
    }


# ---------------------------------------------------------------------------
# Generator tests
# ---------------------------------------------------------------------------


def test_situation_active_card_priority_1():
    card = generate_situation_active_card(_situation(), _ep())
    assert card.card_type == "SITUATION_ACTIVE"
    assert card.priority == 1
    assert "operator" in card.role_visibility


def test_situation_active_card_cites_evidence():
    card = generate_situation_active_card(_situation(), _ep())
    assert len(card.evidence_refs) >= 1


def test_data_quality_card_lists_stale():
    card = generate_data_quality_card(["MOTOR_301_CURRENT"], ["BAD_TAG"])
    assert card.card_type == "DATA_QUALITY_DEGRADED"
    assert "MOTOR_301_CURRENT" in card.summary or any("MOTOR_301_CURRENT" in r.ref_id for r in card.evidence_refs)
    assert "operator" in card.role_visibility


def test_time_to_consequence_card():
    ttc = {"state": "approaching", "seconds_low": 120, "seconds_mid": 240, "seconds_high": 480, "tag_id": "MOTOR_301_TEMP"}
    card = generate_time_to_consequence_card(ttc, "MTR-301", "EV_001")
    assert card.card_type == "TIME_TO_CONSEQUENCE"
    assert card.priority == 1
    assert "MOTOR_301_TEMP" in card.summary or any("MOTOR_301_TEMP" in r.ref_id for r in card.evidence_refs)


def test_agent_draft_card_visible_to_engineer():
    card = generate_agent_draft_card("DRF_001", "2 proposed edges.")
    assert card.card_type == "NEW_AGENT_DRAFT_AVAILABLE"
    assert "engineer" in card.role_visibility
    assert "operator" not in card.role_visibility


def test_compile_failed_card():
    errors = [{"message": "Unknown asset GHOST-999"}, {"message": "Cycle detected"}]
    card = generate_compile_failed_card(errors)
    assert card.card_type == "GRAPH_COMPILE_FAILED"
    assert "Unknown asset GHOST-999" in card.summary or "2 error" in card.summary
    assert "engineer" in card.role_visibility
    assert "operator" not in card.role_visibility


def test_gateway_stale_card():
    card = generate_gateway_stale_card("GW-001", "2026-01-01T10:00:00Z")
    assert card.card_type == "GATEWAY_STALE"
    assert "GW-001" in card.summary
    assert "operator" in card.role_visibility


def test_role_specific_next_action_card():
    action = {"action_id": "INSPECT_SHAFT", "label": "Inspect shaft"}
    card = generate_role_next_action_card("operator", "MOTOR_MECHANICAL_OVERLOAD", action)
    assert card.card_type == "ROLE_SPECIFIC_NEXT_ACTION"
    assert "operator" in card.role_visibility
    assert "engineer" not in card.role_visibility


# ---------------------------------------------------------------------------
# Store tests
# ---------------------------------------------------------------------------


def test_store_get_active_filters_by_role():
    store = ProactiveCardStore()
    # operator card
    card_op = generate_situation_active_card(_situation(), _ep())
    # engineer-only card
    card_eng = generate_agent_draft_card("DRF_002", "Test.")

    store.upsert(card_op)
    store.upsert(card_eng)

    operator_cards = store.get_active("operator")
    engineer_cards = store.get_active("engineer")

    assert any(c.card_id == card_op.card_id for c in operator_cards)
    assert not any(c.card_id == card_eng.card_id for c in operator_cards)
    assert any(c.card_id == card_eng.card_id for c in engineer_cards)


def test_store_dismiss_hides_card():
    store = ProactiveCardStore()
    card = generate_situation_active_card(_situation(), _ep())
    store.upsert(card)

    store.dismiss(card.card_id)
    active = store.get_active("operator")
    assert not any(c.card_id == card.card_id for c in active)


def test_store_pin_prevents_expiry():
    store = ProactiveCardStore()
    card = generate_situation_active_card(_situation(), _ep())
    store.upsert(card)
    store.pin(card.card_id)

    pinned = store.get(card.card_id)
    assert pinned is not None
    assert pinned.pinned is True
    assert pinned.expires_at is None


def test_dismissed_card_not_refreshed():
    store = ProactiveCardStore()
    card = generate_situation_active_card(_situation(), _ep())
    store.upsert(card)
    store.dismiss(card.card_id)

    # Upserting again should be blocked
    store.upsert(card)
    stored = store.get(card.card_id)
    assert stored is not None
    assert stored.dismissed is True


# ---------------------------------------------------------------------------
# update_cards_from_snapshot
# ---------------------------------------------------------------------------


def test_update_cards_creates_situation_card():
    store = ProactiveCardStore()
    store.clear()

    snapshot = {
        "active_situations": [_situation()],
        "latest_evidence_packet": _ep(),
        "latest_calm_card": None,
    }
    cards = update_cards_from_snapshot(snapshot)
    assert len(cards) >= 1
    assert any(c.card_type == "SITUATION_ACTIVE" for c in cards)


def test_update_cards_creates_data_quality_card():
    store = ProactiveCardStore()
    store.clear()

    snapshot = {
        "active_situations": [],
        "latest_evidence_packet": _ep(stale=["MOTOR_301_CURRENT"]),
        "latest_calm_card": None,
    }
    cards = update_cards_from_snapshot(snapshot)
    assert any(c.card_type == "DATA_QUALITY_DEGRADED" for c in cards)


def test_update_cards_creates_ttc_card():
    store = ProactiveCardStore()
    store.clear()

    ttc = {"state": "approaching", "seconds_low": 60, "seconds_mid": 120, "tag_id": "MOTOR_301_TEMP"}
    snapshot = {
        "active_situations": [],
        "latest_evidence_packet": _ep(ttc=ttc),
        "latest_calm_card": None,
    }
    cards = update_cards_from_snapshot(snapshot)
    assert any(c.card_type == "TIME_TO_CONSEQUENCE" for c in cards)
