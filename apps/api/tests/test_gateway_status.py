"""Gateway connection status API tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.runtime.runtime_state import runtime_state


def _viewer_headers(client: TestClient) -> dict[str, str]:
    token = client.post(
        "/internal/auth-test/dev-token",
        json={"role": "viewer", "subject": "gateway-status-test"},
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_gateway_status_reports_empty_runtime(client: TestClient):
    runtime_state.reset()
    response = client.get("/api/gateway/status", headers=_viewer_headers(client))

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["api_runtime"]["tag_count"] == 0
    assert body["api_runtime"]["latest_frame"] is None
    assert isinstance(body["gateway_health"]["reachable"], bool)
