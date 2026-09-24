"""Multi-gateway heartbeat registry API tests."""

from __future__ import annotations

import time
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from app.routers import gateways as gateways_router
from app.routers.gateways import GatewayHeartbeat, GatewayRegistry, registry, status_for_age
from app.runtime.runtime_state import runtime_state
from app.runtime.simulator.simulator_gateway import reset_simulator_gateway_for_tests
from app.schemas.tag_frame import TagFrame

INGEST = {"Authorization": "Bearer change-me"}


@pytest.fixture(autouse=True)
def reset_state():
    registry.clear()
    runtime_state.reset()
    reset_simulator_gateway_for_tests()
    yield
    registry.clear()
    runtime_state.reset()
    reset_simulator_gateway_for_tests()


def _viewer(client: TestClient) -> dict[str, str]:
    token = client.post(
        "/internal/auth-test/dev-token", json={"role": "viewer", "subject": "gateways-test"}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _heartbeat(gateway_id: str = "gw-bench-1", **extra) -> dict:
    body = {
        "gateway_id": gateway_id,
        "hostname": "BENCH-PC",
        "os": "Windows 11",
        "version": "0.1.0",
        "mode": "modbus",
        "links": [
            {
                "state": "connected",
                "device": "COM5",
                "selector": "auto",
                "vid": "1A86",
                "pid": "7523",
                "serial_number": None,
                "description": "USB-SERIAL CH340",
                "reconnect_count": 1,
                "last_error": None,
            }
        ],
        "counters": {"frames_published": 120, "frames_per_s": 4.0, "stale_tags": 0, "modbus_requests": 30},
        "uplink": {"queue_depth": 0, "dropped": 0, "quarantined": 0, "last_status": 200},
        "started_at": "2026-09-24T08:00:00Z",
        "health_port": 9101,
        "ips": ["192.168.1.20"],
        "future_field": "ignored",
    }
    body.update(extra)
    return body


def _frame(tag: str, gateway_id: str | None, source: str = "modbus_rtu") -> dict:
    return TagFrame(
        tag_id=tag,
        asset_id="BUS-101",
        value=48.0,
        unit="V",
        quality="GOOD",
        timestamp=datetime.now(UTC),
        source=source,
        seq=1,
        gateway_id=gateway_id,
    ).model_dump(mode="json")


def test_heartbeat_requires_ingest_token(client: TestClient):
    assert client.post("/api/gateways/heartbeat", json=_heartbeat()).status_code == 401
    bad = {"Authorization": "Bearer wrong"}
    assert client.post("/api/gateways/heartbeat", json=_heartbeat(), headers=bad).status_code == 401
    # A viewer JWT is not an ingest token.
    assert client.post("/api/gateways/heartbeat", json=_heartbeat(), headers=_viewer(client)).status_code == 401


def test_heartbeat_validates_gateway_id(client: TestClient):
    response = client.post("/api/gateways/heartbeat", json=_heartbeat("bad id with spaces"), headers=INGEST)
    assert response.status_code == 422


def test_list_requires_viewer(client: TestClient):
    assert client.get("/api/gateways").status_code == 401


def test_heartbeat_then_list_reports_online_with_remote_addr(client: TestClient):
    response = client.post("/api/gateways/heartbeat", json=_heartbeat(), headers=INGEST)
    assert response.status_code == 200
    assert response.json()["gateway_id"] == "gw-bench-1"

    body = client.get("/api/gateways", headers=_viewer(client)).json()
    assert body["online_within_s"] == 15.0
    [gw] = body["gateways"]
    assert gw["gateway_id"] == "gw-bench-1"
    assert gw["status"] == "online"
    assert gw["remote_addr"] == "testclient"
    assert gw["heartbeat"]["hostname"] == "BENCH-PC"
    assert gw["heartbeat"]["links"][0]["device"] == "COM5"
    assert "future_field" not in gw["heartbeat"]
    assert gw["tags"] == [] and gw["last_frame_at"] is None


def test_latest_heartbeat_replaces_previous_and_keeps_first_seen(client: TestClient):
    client.post("/api/gateways/heartbeat", json=_heartbeat(), headers=INGEST)
    first = client.get("/api/gateways", headers=_viewer(client)).json()["gateways"][0]["first_seen_at"]
    client.post("/api/gateways/heartbeat", json=_heartbeat(hostname="RENAMED"), headers=INGEST)
    [gw] = client.get("/api/gateways", headers=_viewer(client)).json()["gateways"]
    assert gw["heartbeat"]["hostname"] == "RENAMED"
    assert gw["first_seen_at"] == first


def test_tags_are_attributed_to_their_gateway(client: TestClient):
    client.post("/api/gateways/heartbeat", json=_heartbeat("gw-a"), headers=INGEST)
    client.post("/api/gateways/heartbeat", json=_heartbeat("gw-b", mode="line"), headers=INGEST)
    frames = [_frame("BUS_101_V", "gw-a"), _frame("VIB_X", "gw-b"), _frame("SIM_ONLY", "sim", source="simulator")]
    assert client.post("/api/ingest/frame/batch", json=frames, headers=INGEST).status_code == 200

    gws = {g["gateway_id"]: g for g in client.get("/api/gateways", headers=_viewer(client)).json()["gateways"]}
    assert set(gws) == {"gw-a", "gw-b"}
    assert [t["tag_id"] for t in gws["gw-a"]["tags"]] == ["BUS_101_V"]
    assert [t["tag_id"] for t in gws["gw-b"]["tags"]] == ["VIB_X"]
    assert gws["gw-a"]["assets"] == ["BUS-101"]
    assert gws["gw-a"]["last_frame_at"] is not None
    assert gws["gw-a"]["tags"][0]["unit"] == "V"


def test_frames_without_heartbeat_show_as_unknown(client: TestClient):
    client.post("/api/ingest/frame/batch", json=[_frame("BUS_101_V", "gw-legacy")], headers=INGEST)
    [gw] = client.get("/api/gateways", headers=_viewer(client)).json()["gateways"]
    assert gw["gateway_id"] == "gw-legacy"
    assert gw["status"] == "unknown"
    assert gw["heartbeat"] is None
    assert gw["tag_count"] == 1


def test_status_thresholds():
    assert status_for_age(0) == "online"
    assert status_for_age(14.9) == "online"
    assert status_for_age(15) == "stale"
    assert status_for_age(59.9) == "stale"
    assert status_for_age(60) == "offline"


def test_status_goes_stale_then_offline(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    client.post("/api/gateways/heartbeat", json=_heartbeat(), headers=INGEST)
    now = time.monotonic()
    monkeypatch.setattr(gateways_router.time, "monotonic", lambda: now + 30)
    assert client.get("/api/gateways", headers=_viewer(client)).json()["gateways"][0]["status"] == "stale"
    monkeypatch.setattr(gateways_router.time, "monotonic", lambda: now + 120)
    [gw] = client.get("/api/gateways", headers=_viewer(client)).json()["gateways"]
    assert gw["status"] == "offline"
    assert gw["heartbeat_age_s"] >= 119


def test_registry_is_bounded():
    reg = GatewayRegistry(max_gateways=3)
    for i in range(5):
        reg.record(GatewayHeartbeat(gateway_id=f"gw-{i}"), "10.0.0.1")
    ids = [e.heartbeat.gateway_id for e in reg.entries()]
    assert ids == ["gw-2", "gw-3", "gw-4"]
    # Re-heard gateways move to the back and survive eviction.
    reg.record(GatewayHeartbeat(gateway_id="gw-2"), None)
    reg.record(GatewayHeartbeat(gateway_id="gw-9"), None)
    assert [e.heartbeat.gateway_id for e in reg.entries()] == ["gw-4", "gw-2", "gw-9"]
