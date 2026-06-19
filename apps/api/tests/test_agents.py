"""Agent draft approval tests (R5)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.services.agent_queue import reset_agent_queue_for_tests


@pytest.fixture(autouse=True)
def reset_queue():
    reset_agent_queue_for_tests()
    yield
    reset_agent_queue_for_tests()


def _token(client: TestClient, role: str, subject: str = "agent-test") -> dict[str, str]:
    token = client.post(
        "/internal/auth-test/dev-token",
        json={"role": role, "subject": subject},
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_graph_draft_returns_pending(client: TestClient):
    response = client.post(
        "/api/agents/graph-draft",
        json={"prompt": "Review motor-bus edge"},
        headers=_token(client, "engineer"),
    )
    assert response.status_code == 200
    draft = response.json()["draft"]
    assert draft["status"] == "pending"


def test_agent_fallback_does_not_fabricate_edge(client: TestClient):
    response = client.post(
        "/api/agents/graph-draft",
        json={"prompt": "propose edge"},
        headers=_token(client, "engineer"),
    )
    payload = response.json()["draft"]["payload"]
    assert payload["artifact_type"] == "service_unavailable"
    assert payload["proposed_changes"] == []


def test_agent_cannot_approve(client: TestClient):
    draft_id = client.post(
        "/api/agents/graph-draft",
        json={"prompt": "test"},
        headers=_token(client, "agent", subject="agent-bot"),
    ).json()["draft"]["draft_id"]
    response = client.post(
        "/api/agents/drafts/approve",
        json={"draft_id": draft_id},
        headers=_token(client, "agent", subject="agent-bot"),
    )
    assert response.status_code == 403


def test_human_approve_writes_audit(client: TestClient):
    draft_id = client.post(
        "/api/agents/graph-draft",
        json={"prompt": "test"},
        headers=_token(client, "engineer"),
    ).json()["draft"]["draft_id"]
    response = client.post(
        "/api/agents/drafts/approve",
        json={"draft_id": draft_id},
        headers=_token(client, "engineer"),
    )
    assert response.status_code == 200
    assert response.json()["draft"]["status"] == "approved"
    assert "audit_id" in response.json()