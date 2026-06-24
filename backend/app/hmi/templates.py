"""Screen template render helpers (Domain K)."""
from __future__ import annotations


def render_calm_card(situation: dict) -> dict:
    """Render the fixed six-section Calm Card (Domain M) deterministically.

    Sections: (1) What/Situation, (2) Where, (3) Why, (4) Confidence & coverage,
    (5) Action envelope, (6) Acknowledge. Invariant regardless of fault type.
    """
    return {
        "what": situation.get("primary_fault"),
        "where": situation.get("where"),
        "why": situation.get("evidence", {}),
        "confidence": situation.get("confidence"),
        "coverage": situation.get("coverage"),
        "action_envelope": situation.get("actions", []),
    }
