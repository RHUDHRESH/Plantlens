"""Operator/engineer view endpoints: shelving, trends, causal graph, studio layout."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.runtime.alarm_engine import reset_alarm_engine_state
from app.runtime.config_loader import reset_runtime_config_for_tests
from app.runtime.runtime_state import runtime_state
from app.runtime.simulator.scenario_runner import ScenarioRunner
from app.runtime.simulator.simulator_gateway import SimulatorGateway
from app.runtime.websocket_hub import WebSocketHub
from app.schemas.tag_frame import TagFrame

DEMO_DIR = Path(__file__).resolve().parents[3] / "packages" / "sample-data" / "demo-microgrid"


@pytest.fixture(autouse=True)
def _reset():
    runtime_state.reset()
    reset_alarm_engine_state()
    reset_runtime_config_for_tests()
    yield
    runtime_state.reset()
    reset_alarm_engine_state()
    reset_runtime_config_for_tests()


def _auth(client: TestClient, role: str) -> dict[str, str]:
    token = client.post("/internal/auth-test/dev-token", json={"role": role, "subject": f"{role}-1"}).json()[
        "access_token"
    ]
    return {"Authorization": f"Bearer {token}"}


def _run_hero() -> None:
    """Replay hero frames into the live state WITHOUT the scenario reset (which clears shelving)."""
    runner = ScenarioRunner(scenarios_path=DEMO_DIR / "scenarios.json", tag_map_path=DEMO_DIR / "tag_map.json")
    gateway = SimulatorGateway(state=runtime_state, hub=WebSocketHub(), runner=runner)

    async def _replay() -> None:
        for frame in await runner.collect_frames("scn_motor_overload"):
            await gateway.on_frame(frame)
        await gateway._finalize_tick()

    asyncio.run(_replay())


def test_shelve_requires_reason_and_bounds(client: TestClient):
    headers = _auth(client, "operator")
    assert client.post("/api/runtime/alarms/DC_BUS_LOW/shelve", json={"duration_s": 600, "reason": ""},
                       headers=headers).status_code == 422
    assert client.post("/api/runtime/alarms/DC_BUS_LOW/shelve", json={"duration_s": 10, "reason": "test"},
                       headers=headers).status_code == 422
    assert client.post("/api/runtime/alarms/NOPE/shelve", json={"duration_s": 600, "reason": "test"},
                       headers=headers).status_code == 404


def test_shelve_suppresses_alarm_and_is_listed_then_unshelve(client: TestClient):
    headers = _auth(client, "operator")
    response = client.post(
        "/api/runtime/alarms/DC_BUS_LOW/shelve",
        json={"duration_s": 900, "reason": "Bus sensor recalibration"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    _run_hero()
    assert "DC_BUS_LOW" not in runtime_state.active_alarms
    listed = client.get("/api/runtime/alarms/shelved", headers=_auth(client, "viewer")).json()["shelved"]
    assert listed and listed[0]["alarm_id"] == "DC_BUS_LOW"
    assert listed[0]["reason"] == "Bus sensor recalibration"
    assert client.post("/api/runtime/alarms/DC_BUS_LOW/unshelve", headers=headers).status_code == 200
    assert client.get("/api/runtime/alarms/shelved", headers=_auth(client, "viewer")).json()["shelved"] == []


def test_viewer_cannot_shelve(client: TestClient):
    response = client.post("/api/runtime/alarms/DC_BUS_LOW/shelve", json={"duration_s": 600, "reason": "x y z"},
                           headers=_auth(client, "viewer"))
    assert response.status_code == 403


def test_trends_return_history_for_requested_tags(client: TestClient):
    _run_hero()
    body = client.get(
        "/api/runtime/trends",
        params={"tag_ids": "MOTOR_301_CURRENT,BUS_101_V", "seconds": 3600},
        headers=_auth(client, "viewer"),
    ).json()
    series = {s["tag_id"]: s for s in body["series"]}
    assert series["MOTOR_301_CURRENT"]["unit"] == "A"
    values = [p[1] for p in series["MOTOR_301_CURRENT"]["points"]]
    assert 1.2 in values and 3.4 in values


def test_trend_ring_is_bounded():
    from app.runtime import runtime_state as rs

    state = rs.RuntimeState()
    start = datetime(2026, 1, 1, tzinfo=UTC)
    for i in range(rs.TREND_POINTS_PER_TAG + 50):
        state.update_tag(TagFrame(tag_id="T", asset_id="A", value=float(i), unit="V", quality="GOOD",
                                  source="simulator", timestamp=start + timedelta(seconds=i)))
    assert len(state.tag_history("T")) == rs.TREND_POINTS_PER_TAG


def test_causal_graph_projection_highlights_active_path(client: TestClient):
    _run_hero()
    body = client.get("/api/runtime/causal-graph", headers=_auth(client, "viewer")).json()
    edges = {e["id"]: e for e in body["edges"]}
    assert edges["E5"]["approved"] is True and edges["E5"]["polarity"] == "-"
    assert edges["E_UNAPPROVED"]["approved"] is False
    assert body["highlight"]["root_asset_id"] == "MTR-301"
    assert "E5" in body["highlight"]["traversed_edges"]
    assert {n["id"] for n in body["nodes"]} >= {"MTR-301", "BUS-101"}


def test_layout_roundtrip_and_conflict(client: TestClient):
    eng = _auth(client, "engineer")
    empty = client.get("/api/studio/layout/demo", headers=_auth(client, "viewer")).json()
    assert empty["revision"] == 0
    saved = client.put("/api/studio/layout/demo", json={"positions": {"MTR-301": {"x": 10, "y": 20}},
                                                        "base_revision": 0}, headers=eng)
    assert saved.status_code == 200 and saved.json()["revision"] == 1
    stale = client.put("/api/studio/layout/demo", json={"positions": {}, "base_revision": 0}, headers=eng)
    assert stale.status_code == 409
    loaded = client.get("/api/studio/layout/demo", headers=_auth(client, "viewer")).json()
    assert loaded["positions"]["MTR-301"] == {"x": 10.0, "y": 20.0}
    assert client.put("/api/studio/layout/demo", json={"positions": {}},
                      headers=_auth(client, "operator")).status_code == 403


def test_actions_are_gated_by_role_and_blocking_alarms(client: TestClient):
    _run_hero()
    operator = client.get("/api/runtime/actions", headers=_auth(client, "operator")).json()
    assert operator["situation_type"] == "MOTOR_MECHANICAL_OVERLOAD"
    by_id = {a["action_id"]: a for a in operator["actions"]}
    assert by_id["INSPECT_SHAFT_LOAD"]["allowed"] is True
    assert by_id["INSPECT_SHAFT_LOAD"]["requires_isolation"] is True
    viewer = client.get("/api/runtime/actions", headers=_auth(client, "viewer")).json()
    assert all(a["allowed"] is False and "not permitted" in a["reason"] for a in viewer["actions"])


def test_actions_can_target_a_specific_situation(client: TestClient):
    _run_hero()
    headers = _auth(client, "operator")
    sid = next(iter(runtime_state.active_situations))
    picked = client.get("/api/runtime/actions", params={"situation_id": sid}, headers=headers).json()
    assert picked["situation_id"] == sid
    assert picked["situation_type"] == "MOTOR_MECHANICAL_OVERLOAD"
    assert picked["actions"]
    gone = client.get("/api/runtime/actions", params={"situation_id": "no-such"}, headers=headers).json()
    assert gone["situation_id"] is None and gone["situation_type"] is None and gone["actions"] == []


def test_blocked_if_active_alarm_blocks_even_permitted_roles():
    from app.runtime.calm_card_engine import evaluate_actions_for_role

    envelope = {"actions": [{"id": "RESTART", "label": "Restart", "situation_ids": ["S"],
                             "allowed_roles": ["maintenance"], "blocked_if": ["MOTOR_TEMP_HIGH"],
                             "blocked_message": "Blocked while motor hot."}]}
    result = evaluate_actions_for_role("S", "maintenance", {"MOTOR_TEMP_HIGH"}, envelope)
    assert result[0]["allowed"] is False and result[0]["reason"] == "Blocked while motor hot."
    assert evaluate_actions_for_role("S", "maintenance", set(), envelope)[0]["allowed"] is True
