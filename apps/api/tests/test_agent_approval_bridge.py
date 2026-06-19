"""Human approval bridge tests — runtime unchanged until compile/deploy."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.services.agent_queue import agent_draft_queue, reset_agent_queue_for_tests


@pytest.fixture(autouse=True)
def reset_queue():
    reset_agent_queue_for_tests()
    yield
    reset_agent_queue_for_tests()


def _token(client: TestClient, role: str, subject: str = "bridge-test") -> dict[str, str]:
    token = client.post(
        "/internal/auth-test/dev-token",
        json={"role": role, "subject": subject},
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_approve_stores_artifact_without_runtime_deploy(client: TestClient):
    draft_id = client.post(
        "/api/agents/graph-draft",
        json={"prompt": "review edge"},
        headers=_token(client, "engineer"),
    ).json()["draft"]["draft_id"]

    response = client.post(
        "/api/agents/drafts/approve",
        json={"draft_id": draft_id},
        headers=_token(client, "engineer"),
    )
    assert response.status_code == 200
    body = response.json()
    bridge = body["bridge"]
    assert bridge["runtime_deployed"] is False
    assert bridge["approved_artifact_stored"] is True
    assert "unchanged" in bridge["message"].lower()

    stored = agent_draft_queue.get_approved(draft_id)
    assert stored is not None
    assert stored["status"] == "approved"


def test_viewer_cannot_approve(client: TestClient):
    draft_id = client.post(
        "/api/agents/graph-draft",
        json={"prompt": "test"},
        headers=_token(client, "viewer", subject="viewer-1"),
    ).json()["draft"]["draft_id"]
    response = client.post(
        "/api/agents/drafts/approve",
        json={"draft_id": draft_id},
        headers=_token(client, "viewer", subject="viewer-1"),
    )
    assert response.status_code == 403


def test_reject_writes_audit(client: TestClient):
    draft_id = client.post(
        "/api/agents/graph-draft",
        json={"prompt": "reject me"},
        headers=_token(client, "engineer"),
    ).json()["draft"]["draft_id"]
    response = client.post(
        "/api/agents/drafts/reject",
        json={"draft_id": draft_id},
        headers=_token(client, "engineer"),
    )
    assert response.status_code == 200
    assert response.json()["draft"]["status"] == "rejected"
    assert "audit_id" in response.json()
    assert agent_draft_queue.get_approved(draft_id) is None