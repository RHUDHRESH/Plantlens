"""Incident Room tests."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.incidents.incident_store import reset_incident_store_for_tests


@pytest.fixture(autouse=True)
def reset_store():
    reset_incident_store_for_tests()
    yield
    reset_incident_store_for_tests()


def _auth(client: TestClient, role: str = "operator") -> dict[str, str]:
    token = client.post(
        "/internal/auth-test/dev-token",
        json={"role": role, "subject": "inc-test"},
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _escalate_body() -> dict:
    return {
        "calm_card": {
            "title": "Motor overload",
            "severity": "critical",
            "root_asset_id": "MTR-301",
            "root_asset_name": "Motor 301",
        },
        "situation": {
            "situation_id": "sit_motor_overload",
            "situation_type": "motor_overload",
            "root_asset_id": "MTR-301",
            "severity": "critical",
            "causal_path": ["MTR-301", "BUS-101"],
        },
        "raw_alarms": [{"alarm_id": "MOTOR_TEMP_HIGH", "asset_id": "MTR-301"}],
    }


def test_escalate_creates_incident(client: TestClient):
    response = client.post(
        "/api/incidents/escalate",
        json=_escalate_body(),
        headers=_auth(client),
    )
    assert response.status_code == 200
    incident = response.json()["incident"]
    assert incident["status"] == "open"
    assert incident["timeline"][0]["type"] == "incident_created"
    assert "audit_id" in response.json()


def test_timeline_append_only(client: TestClient):
    created = client.post(
        "/api/incidents/escalate",
        json=_escalate_body(),
        headers=_auth(client),
    ).json()["incident"]
    incident_id = created["incident_id"]
    before_len = len(created["timeline"])
    client.post(
        f"/api/incidents/{incident_id}/comments",
        json={"message": "Checked motor coupling"},
        headers=_auth(client),
    )
    room = client.get(f"/api/incidents/{incident_id}", headers=_auth(client)).json()
    assert len(room["timeline"]) == before_len + 1
    assert room["timeline"][-1]["type"] == "comment"