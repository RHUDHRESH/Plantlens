"""Library analysis API route tests."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

SAMPLE_DIR = Path(__file__).resolve().parents[5] / "packages" / "sample-data" / "component-library"
ANALYZE_PATH = "/api/library/analyze-assembly"
SCORE_PATH = "/api/library/score-faults"


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _viewer_token(client: TestClient) -> str:
    response = client.post(
        "/internal/auth-test/dev-token",
        json={"role": "viewer", "subject": "analysis-route-test"},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


@pytest.fixture
def client() -> TestClient:
    with TestClient(create_app()) as test_client:
        yield test_client


def test_post_analyze_assembly_returns_all_matrices(client: TestClient):
    token = _viewer_token(client)
    assembly = json.loads((SAMPLE_DIR / "demo_motor_fan_blower_assembly.json").read_text(encoding="utf-8"))
    response = client.post(ANALYZE_PATH, headers=_auth_header(token), json={"plant_assembly": assembly})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in {"ok", "error"}
    assert "fault_signature_matrix" in data
    assert "observability_matrix" in data
    assert "causal_propagation_matrix" in data
    assert "sensor_recommendations" in data


def test_post_score_faults_returns_ranked_faults(client: TestClient):
    token = _viewer_token(client)
    assembly = json.loads((SAMPLE_DIR / "demo_motor_fan_blower_assembly.json").read_text(encoding="utf-8"))
    response = client.post(
        SCORE_PATH,
        headers=_auth_header(token),
        json={
            "plant_assembly": assembly,
            "observed_signals": {
                "dc_motor_12v_1.motor_current": {"value": 5.0, "relation": "high", "quality": "good", "timestamp_status": "fresh"},
                "dc_motor_12v_1.motor_rpm": {"value": 100, "relation": "low", "quality": "good", "timestamp_status": "fresh"},
            },
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["ranked_faults"]
    assert "final_score" in data["ranked_faults"][0]