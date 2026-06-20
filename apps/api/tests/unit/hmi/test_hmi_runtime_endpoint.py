"""Unit tests for GET /api/hmi/runtime."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

RUNTIME_PATH = "/api/hmi/runtime"
COMPILED_PATH = "/api/hmi/compiled"
PREVIEW_PATH = "/api/hmi/preview"


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _viewer_token(client: TestClient) -> str:
    response = client.post(
        "/internal/auth-test/dev-token",
        json={"role": "viewer", "subject": "hmi-runtime-test"},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


@pytest.fixture
def client() -> TestClient:
    with TestClient(create_app()) as test_client:
        yield test_client


def test_runtime_route_registered(client: TestClient):
    paths = set(client.app.openapi()["paths"].keys())
    assert RUNTIME_PATH in paths
    assert COMPILED_PATH in paths
    assert PREVIEW_PATH in paths


def test_runtime_returns_valid_plant_hmi_state(client: TestClient):
    token = _viewer_token(client)
    response = client.get(RUNTIME_PATH, headers=_auth_header(token))

    assert response.status_code == 200
    data = response.json()
    assert "plant_id" in data
    assert "run_id" in data
    assert "generated_at" in data
    assert "overall_status" in data
    assert "data_quality" in data
    assert data["root_cause_candidates"] == []


def test_runtime_route_returns_hmi_shape_with_empty_state(client: TestClient):
    token = _viewer_token(client)
    response = client.get(RUNTIME_PATH, headers=_auth_header(token))

    assert response.status_code == 200
    data = response.json()
    assert "overall_status" in data
    assert "data_quality" in data
    assert response.status_code != 500


def test_existing_hmi_routes_preserved(client: TestClient):
    paths = set(client.app.openapi()["paths"].keys())
    assert COMPILED_PATH in paths
    assert PREVIEW_PATH in paths
    assert RUNTIME_PATH in paths


def test_runtime_route_has_no_preview_side_effect(client: TestClient):
    token = _viewer_token(client)
    response = client.get(RUNTIME_PATH, headers=_auth_header(token))

    assert response.status_code == 200
    assert "canonical_payload" not in response.json()