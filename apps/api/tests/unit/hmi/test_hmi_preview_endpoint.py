"""Unit tests for POST /api/hmi/preview."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "hmi"
FIXED_GENERATED_AT = "2026-06-20T12:00:05Z"
PREVIEW_PATH = "/api/hmi/preview"
COMPILED_PATH = "/api/hmi/compiled"


def _load_fixture(name: str) -> dict:
    with (FIXTURES_DIR / name).open(encoding="utf-8") as handle:
        return json.load(handle)


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _viewer_token(client: TestClient) -> str:
    response = client.post(
        "/internal/auth-test/dev-token",
        json={"role": "viewer", "subject": "hmi-preview-test"},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def _preview_request(payload: dict, *, gate_results: list | dict | None = None) -> dict:
    body: dict = {
        "canonical_payload": payload,
        "generated_at": FIXED_GENERATED_AT,
    }
    if gate_results is not None:
        body["gate_results"] = gate_results
    return body


def _post_preview(client: TestClient, body: dict):
    token = _viewer_token(client)
    return client.post(PREVIEW_PATH, json=body, headers=_auth_header(token))


@pytest.fixture
def client() -> TestClient:
    with TestClient(create_app()) as test_client:
        yield test_client


def test_preview_healthy_returns_healthy_state(client: TestClient):
    response = _post_preview(client, _preview_request(_load_fixture("healthy_motor_fan_blower.json")))

    assert response.status_code == 200
    data = response.json()
    assert data["overall_status"] == "healthy"
    assert data["active_incident"] is None
    assert data["plant_id"] == "PLANTLENS_DEMO_BENCH"
    assert data["signals"]
    assert data["assets"]
    assert data["generated_at"] == FIXED_GENERATED_AT


def test_preview_motor_obstruction_returns_incident(client: TestClient):
    response = _post_preview(client, _preview_request(_load_fixture("motor_obstruction.json")))

    assert response.status_code == 200
    data = response.json()
    assert data["overall_status"] == "fault"
    assert data["active_incident"] is not None
    assert data["active_incident"]["suspected_root_cause"] == "MOTOR_MECHANICAL_OBSTRUCTION"
    assert data["operator_actions"][0]["target_asset_id"] == "MTR-12V"
    assert data["suppressed_symptoms"] == ["FAN_RPM", "BLW_AIRFLOW"]


def test_preview_voltage_sag_returns_supply_root(client: TestClient):
    response = _post_preview(client, _preview_request(_load_fixture("voltage_sag.json")))

    assert response.status_code == 200
    data = response.json()
    assert data["active_incident"]["suspected_root_cause"] == "SUPPLY_VOLTAGE_SAG"
    assert data["active_incident"]["primary_alarms"] == ["PSU_VOLTAGE"]
    assert data["operator_actions"][0]["target_asset_id"] == "PSU-12V"


def test_preview_airflow_blockage_does_not_blame_motor(client: TestClient):
    response = _post_preview(client, _preview_request(_load_fixture("airflow_blockage.json")))

    assert response.status_code == 200
    data = response.json()
    assert data["active_incident"]["suspected_root_cause"] == "DOWNSTREAM_AIRFLOW_BLOCKAGE"

    assets = {asset["asset_id"]: asset for asset in data["assets"]}
    assert assets["MTR-12V"]["status"] == "healthy"
    assert assets["BLW-01"]["status"] == "fault"
    assert not any("Stop motor" in action["title"] for action in data["operator_actions"])


def test_preview_missing_sensor_returns_warning_without_fake_incident(client: TestClient):
    response = _post_preview(client, _preview_request(_load_fixture("missing_sensor.json")))

    assert response.status_code == 200
    data = response.json()
    assert data["overall_status"] == "warning"
    assert data["active_incident"] is None
    assert "MTR_VIBRATION" in data["data_quality"]["missing_signals"]
    assert data["operator_actions"][0]["title"] == "Verify sensor data quality"


def test_preview_gate_blocker_returns_blocked_state(client: TestClient):
    gate_results = [
        {
            "gate_name": "artifact_integrity",
            "verdict": "fail",
            "issues": [
                {
                    "code": "HASH_MISMATCH",
                    "severity": "BLOCKER",
                    "message": "hash mismatch",
                }
            ],
        }
    ]
    response = _post_preview(
        client,
        _preview_request(_load_fixture("healthy_motor_fan_blower.json"), gate_results=gate_results),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["overall_status"] == "blocked"
    assert data["assets"] == []
    assert data["signals"] == []
    assert data["active_incident"] is None
    assert data["data_quality"]["confidence_penalty"] == 1.0
    notes_text = " ".join(data["data_quality"]["notes"])
    assert "artifact_integrity" in notes_text
    assert "HASH_MISMATCH" in notes_text


def test_preview_non_blocking_warn_still_projects(client: TestClient):
    gate_results = [
        {
            "gate_name": "canonical_schema",
            "verdict": "warn",
            "issues": [
                {
                    "code": "UNKNOWN_SIDE",
                    "severity": "MEDIUM",
                    "message": "side unknown",
                }
            ],
        }
    ]
    response = _post_preview(
        client,
        _preview_request(_load_fixture("healthy_motor_fan_blower.json"), gate_results=gate_results),
    )

    assert response.status_code == 200
    assert response.json()["overall_status"] == "healthy"


def test_preview_malformed_payload_returns_400_or_422(client: TestClient):
    response = _post_preview(
        client,
        {
            "canonical_payload": {
                "plant_id": "BROKEN",
                "run_id": "BROKEN",
            },
            "generated_at": FIXED_GENERATED_AT,
        },
    )

    assert response.status_code in {400, 422}
    assert response.status_code != 500
    if response.status_code == 200:
        pytest.fail("malformed payload must not return healthy state")
    data = response.json()
    if response.status_code == 200:
        assert data["overall_status"] != "healthy"


def test_preview_response_datetimes_are_json_strings(client: TestClient):
    response = _post_preview(client, _preview_request(_load_fixture("motor_obstruction.json")))

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data["generated_at"], str)
    assert isinstance(data["active_incident"]["started_at"], str)
    for item in data["active_incident"]["evidence"]:
        if item["timestamp"] is not None:
            assert isinstance(item["timestamp"], str)


def test_preview_output_is_deterministic_with_fixed_generated_at(client: TestClient):
    body = _preview_request(_load_fixture("motor_obstruction.json"))
    first = _post_preview(client, body)
    second = _post_preview(client, body)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json() == second.json()


def test_existing_compiled_route_still_registered():
    app = create_app()
    route_paths = set(app.openapi()["paths"].keys())
    assert COMPILED_PATH in route_paths
    assert PREVIEW_PATH in route_paths


def test_preview_does_not_mutate_request_payload(client: TestClient):
    payload = _load_fixture("motor_obstruction.json")
    original = deepcopy(payload)

    _post_preview(client, _preview_request(payload))

    assert payload == original