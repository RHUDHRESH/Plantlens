"""Unit tests for library API routes."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

LIST_PATH = "/api/library/components"
MOTOR_PATH = "/api/library/components/dc_motor_12v"
UNKNOWN_PATH = "/api/library/components/unknown_part_xyz"
MATRIX_PATH = "/api/library/compatibility-matrix"
CHECK_PATH = "/api/library/check-connection"
VALIDATE_PATH = "/api/library/validate-assembly"

SAMPLE_DIR = Path(__file__).resolve().parents[5] / "packages" / "sample-data" / "component-library"


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _viewer_token(client: TestClient) -> str:
    response = client.post(
        "/internal/auth-test/dev-token",
        json={"role": "viewer", "subject": "library-route-test"},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


@pytest.fixture
def client() -> TestClient:
    with TestClient(create_app()) as test_client:
        yield test_client


def test_list_components_returns_ok_and_count(client: TestClient):
    token = _viewer_token(client)
    response = client.get(LIST_PATH, headers=_auth_header(token))
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["count"] >= 24
    assert data["count"] == 27
    assert len(data["components"]) == data["count"]
    assert "categories" in data


def test_get_dc_motor_returns_motor(client: TestClient):
    token = _viewer_token(client)
    response = client.get(MOTOR_PATH, headers=_auth_header(token))
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["component"]["component_type_id"] == "dc_motor_12v"
    assert data["component"]["display_name"] == "12V DC Motor"


def test_get_unknown_component_returns_structured_404(client: TestClient):
    token = _viewer_token(client)
    response = client.get(UNKNOWN_PATH, headers=_auth_header(token))
    assert response.status_code == 404
    detail = response.json()["detail"]
    assert detail["code"] == "component_not_found"
    assert "unknown_part_xyz" in detail["message"]
    assert detail.get("fix")


def test_get_compatibility_matrix_returns_summary(client: TestClient):
    token = _viewer_token(client)
    response = client.get(MATRIX_PATH, headers=_auth_header(token))
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["components_count"] >= 27
    assert data["compatible_edges_count"] > 0
    assert data["rejected_edges_count"] > 0
    assert data["compatible_edges_sample"]


def test_post_check_connection_returns_reason(client: TestClient):
    token = _viewer_token(client)
    response = client.post(
        CHECK_PATH,
        headers=_auth_header(token),
        json={
            "from_component_type_id": "dc_power_supply",
            "from_port_id": "dc_out",
            "to_component_type_id": "dc_motor_12v",
            "to_port_id": "power_in",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["compatible"] is True
    assert data["reason"]


def test_post_validate_assembly_returns_structured_errors(client: TestClient):
    token = _viewer_token(client)
    invalid = json.loads((SAMPLE_DIR / "invalid_bad_connection_assembly.json").read_text(encoding="utf-8"))
    response = client.post(VALIDATE_PATH, headers=_auth_header(token), json={"plant_assembly": invalid})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "error"
    assert any(err["code"] == "INCOMPATIBLE_PORTS" for err in data["errors"])