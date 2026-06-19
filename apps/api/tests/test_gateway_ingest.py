"""Gateway ingest API tests."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from app.runtime.runtime_state import runtime_state
from app.runtime.simulator.simulator_gateway import reset_simulator_gateway_for_tests
from app.schemas.tag_frame import TagFrame


@pytest.fixture(autouse=True)
def reset_state():
    runtime_state.reset()
    reset_simulator_gateway_for_tests()
    yield
    runtime_state.reset()
    reset_simulator_gateway_for_tests()


def _gateway_headers() -> dict[str, str]:
    return {"Authorization": "Bearer change-me"}


def _sample_frame() -> dict:
    return TagFrame(
        tag_id="BUS_101_V",
        asset_id="BUS-101",
        value=48.0,
        unit="V",
        quality="GOOD",
        timestamp=datetime.now(UTC),
        source="modbus_rtu",
        seq=1,
        gateway_id="gw-test",
    ).model_dump(mode="json")


def test_ingest_frame_requires_token(client: TestClient):
    response = client.post("/api/ingest/frame", json=_sample_frame())
    assert response.status_code == 401


def test_ingest_frame_accepts_valid_frame(client: TestClient):
    response = client.post(
        "/api/ingest/frame",
        json=_sample_frame(),
        headers=_gateway_headers(),
    )
    assert response.status_code == 200
    assert response.json()["accepted"] == 1
    assert runtime_state.get_tag("BUS_101_V") is not None


def test_ingest_batch(client: TestClient):
    frames = [_sample_frame(), _sample_frame()]
    frames[1]["tag_id"] = "MOTOR_301_TEMP"
    frames[1]["asset_id"] = "MTR-301"
    response = client.post(
        "/api/ingest/frame/batch",
        json=frames,
        headers=_gateway_headers(),
    )
    assert response.status_code == 200
    assert response.json()["accepted"] == 2


def test_bad_frame_does_not_crash_api(client: TestClient):
    bad = _sample_frame()
    bad["tag_id"] = "bad tag"
    response = client.post(
        "/api/ingest/frame",
        json=bad,
        headers=_gateway_headers(),
    )
    assert response.status_code == 422


def test_stale_frame_ingested(client: TestClient):
    frame = _sample_frame()
    frame["quality"] = "STALE"
    frame["value"] = None
    response = client.post(
        "/api/ingest/frame",
        json=frame,
        headers=_gateway_headers(),
    )
    assert response.status_code == 200
    tag = runtime_state.get_tag("BUS_101_V")
    assert tag is not None
    assert tag.quality == "STALE"