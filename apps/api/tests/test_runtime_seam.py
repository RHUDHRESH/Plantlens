"""Runtime contract seam tests — gateway ingest → snapshot → WebSocket."""

from __future__ import annotations

import json
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


def _bad_modbus_frame(*, value: float | None = None) -> dict:
    return TagFrame(
        tag_id="MOTOR_301_RPM",
        asset_id="MTR-301",
        value=value,
        unit="rpm",
        quality="BAD",
        timestamp=datetime(2026, 6, 19, 12, 0, 0, tzinfo=UTC),
        source="modbus_rtu",
        seq=42,
        gateway_id="gw-test",
    ).model_dump(mode="json")


def test_bad_modbus_ingest_surfaces_null_in_runtime_snapshot(client: TestClient):
    response = client.post(
        "/api/ingest/frame",
        json=_bad_modbus_frame(value=None),
        headers=_gateway_headers(),
    )
    assert response.status_code == 200

    snapshot = client.get(
        "/api/runtime/snapshot",
        headers={
            "Authorization": f"Bearer {client.post('/internal/auth-test/dev-token', json={'role': 'viewer', 'subject': 'seam'}).json()['access_token']}"
        },
    )
    assert snapshot.status_code == 200
    tag = snapshot.json()["tags"]["MOTOR_301_RPM"]
    assert tag["quality"] == "BAD"
    assert tag["value"] is None
    assert tag["asset_id"] == "MTR-301"
    assert tag["timestamp"]
    assert tag["source"] == "modbus_rtu"
    assert tag["seq"] == 42


def test_bad_modbus_ingest_never_preserves_fake_numeric_value(client: TestClient):
    """BAD quality must not leak a stale numeric value to the UI seam."""
    response = client.post(
        "/api/ingest/frame",
        json=_bad_modbus_frame(value=0.0),
        headers=_gateway_headers(),
    )
    assert response.status_code == 200

    stored = runtime_state.get_tag("MOTOR_301_RPM")
    assert stored is not None
    assert stored.quality == "BAD"
    assert stored.value is None
    snapshot_tag = runtime_state.snapshot()["tags"]["MOTOR_301_RPM"]
    assert snapshot_tag["quality"] == "BAD"
    assert snapshot_tag["value"] is None


@pytest.mark.asyncio
async def test_websocket_emits_runtime_snapshot_on_ingest(client: TestClient):
    from app.runtime.simulator.simulator_gateway import get_simulator_gateway

    received: list[dict] = []

    class _FakeWebSocket:
        async def accept(self) -> None:
            return None

        async def send_text(self, payload: str) -> None:
            message = json.loads(payload)
            if message.get("type") == "runtime.snapshot":
                received.append(message)

    gateway = get_simulator_gateway()
    ws = _FakeWebSocket()
    await gateway._hub.connect(ws)  # type: ignore[arg-type]

    response = client.post(
        "/api/ingest/frame",
        json=_bad_modbus_frame(value=None),
        headers=_gateway_headers(),
    )
    assert response.status_code == 200
    assert received, "expected runtime.snapshot over WebSocket after ingest"
    latest = received[-1]
    assert latest["type"] == "runtime.snapshot"
    assert "state" in latest
    assert latest["state"]["tags"]["MOTOR_301_RPM"]["quality"] == "BAD"
    assert latest["state"]["tags"]["MOTOR_301_RPM"]["value"] is None