"""Gateway commissioning proxy API tests."""

from __future__ import annotations

from fastapi.testclient import TestClient


def _engineer_headers(client: TestClient) -> dict[str, str]:
    token = client.post(
        "/internal/auth-test/dev-token",
        json={"role": "engineer", "subject": "commission-test"},
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _viewer_headers(client: TestClient) -> dict[str, str]:
    token = client.post(
        "/internal/auth-test/dev-token",
        json={"role": "viewer", "subject": "commission-viewer"},
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_gateway_ports_requires_engineer(client: TestClient):
    response = client.get("/api/gateway/ports")
    assert response.status_code == 401


def test_gateway_ports_returns_structured_payload(client: TestClient):
    response = client.get("/api/gateway/ports", headers=_engineer_headers(client))
    assert response.status_code == 200
    body = response.json()
    assert body["status"] in {"ok", "unavailable"}
    assert isinstance(body["ports"], list)


def test_gateway_connection_status_documents_runtime_contract(client: TestClient):
    response = client.get("/api/gateway/connection/status", headers=_viewer_headers(client))
    assert response.status_code == 200
    body = response.json()
    assert body["contract"]["message_type"] == "runtime.snapshot"
    assert body["contract"]["websocket"] == "/api/ws/runtime"
    assert body["contract"]["ingest"] == "/api/ingest/frame"