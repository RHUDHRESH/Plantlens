"""Simulator gateway tests (Prompts 15-16)."""

from __future__ import annotations

import asyncio
import json
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.runtime.config_loader import reset_runtime_config_for_tests
from app.runtime.runtime_state import RuntimeState
from app.runtime.simulator.scenario_runner import (
    InvalidScenarioDataError,
    ScenarioNotFoundError,
    ScenarioRunner,
)
from app.runtime.simulator.simulator_gateway import SimulatorGateway, reset_simulator_gateway_for_tests
from app.runtime.websocket_hub import WebSocketHub
from app.schemas.tag_frame import TagFrame

REPO_ROOT = Path(__file__).resolve().parents[3]
DEMO_DIR = REPO_ROOT / "packages" / "sample-data" / "demo-microgrid"
API_ROOT = Path(__file__).resolve().parents[1]

SIMULATOR_FORBIDDEN_PREFIXES = (
    "app.runtime.alarm_engine",
    "app.runtime.dag_runtime",
    "app.runtime.situation_engine",
    "app.gateway",
)


@pytest.fixture
def demo_runner() -> ScenarioRunner:
    return ScenarioRunner(
        scenarios_path=DEMO_DIR / "scenarios.json",
        tag_map_path=DEMO_DIR / "tag_map.json",
    )


@pytest.fixture
def isolated_gateway(demo_runner: ScenarioRunner) -> SimulatorGateway:
    state = RuntimeState()
    hub = WebSocketHub()
    return SimulatorGateway(state=state, hub=hub, runner=demo_runner)


@pytest.fixture(autouse=True)
def reset_runtime_singletons() -> None:
    reset_runtime_config_for_tests()
    reset_simulator_gateway_for_tests()
    yield
    reset_runtime_config_for_tests()
    reset_simulator_gateway_for_tests()


def _auth_header(client: TestClient, role: str = "engineer") -> dict[str, str]:
    response = client.post(
        "/internal/auth-test/dev-token",
        json={"role": role, "subject": "sim-test"},
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_motor_overload_ordered_frames(demo_runner: ScenarioRunner):
    frames = asyncio.run(demo_runner.collect_frames("scn_motor_overload"))
    tag_sequence = [frame.tag_id for frame in frames]
    assert tag_sequence.index("MOTOR_301_CURRENT") < tag_sequence.index("MOTOR_301_RPM")
    assert tag_sequence.index("MOTOR_301_RPM") < tag_sequence.index("BUS_101_V")
    assert tag_sequence.index("BUS_101_V") < tag_sequence.index("INV_102_UNDERVOLTAGE")


def test_rs485_dropout_emits_stale(demo_runner: ScenarioRunner):
    frames = asyncio.run(demo_runner.collect_frames("scn_rs485_dropout"))
    stale_frames = [frame for frame in frames if frame.quality == "STALE"]
    assert stale_frames
    assert stale_frames[0].tag_id == "MOTOR_301_CURRENT"
    assert all(frame.quality != "GOOD" for frame in stale_frames)


def test_unknown_scenario_raises(demo_runner: ScenarioRunner):
    with pytest.raises(ScenarioNotFoundError):
        asyncio.run(demo_runner.collect_frames("scn_does_not_exist"))


def test_emitted_frames_validate_against_schema(demo_runner: ScenarioRunner):
    frames = asyncio.run(demo_runner.collect_frames("scn_motor_overload"))
    for frame in frames:
        TagFrame.model_validate(frame.model_dump(mode="json"))


def test_deterministic_replay(demo_runner: ScenarioRunner):
    first = asyncio.run(demo_runner.collect_frames("scn_motor_overload"))
    second = asyncio.run(demo_runner.collect_frames("scn_motor_overload"))
    assert [frame.model_dump(mode="json") for frame in first] == [
        frame.model_dump(mode="json") for frame in second
    ]


def test_invalid_event_action_fails_closed(demo_runner: ScenarioRunner, tmp_path: Path):
    scenarios = json.loads((DEMO_DIR / "scenarios.json").read_text(encoding="utf-8"))
    scenarios["scenarios"][0]["events"].append(
        {"at_ms": 1, "action": "explode", "tag": "MOTOR_301_CURRENT"}
    )
    bad_path = tmp_path / "scenarios.json"
    bad_path.write_text(json.dumps(scenarios), encoding="utf-8")
    runner = ScenarioRunner(scenarios_path=bad_path, tag_map_path=DEMO_DIR / "tag_map.json")
    with pytest.raises(InvalidScenarioDataError):
        asyncio.run(runner.collect_frames("scn_motor_overload"))


@pytest.mark.asyncio
async def test_websocket_receives_ordered_frames(isolated_gateway: SimulatorGateway):
    received: list[str] = []

    class _FakeWebSocket:
        async def accept(self) -> None:
            return None

        async def send_text(self, payload: str) -> None:
            message = json.loads(payload)
            if message.get("type") == "tag.frame":
                received.append(message["frame"]["tag_id"])

    ws = _FakeWebSocket()
    await isolated_gateway._hub.connect(ws)  # type: ignore[arg-type]
    await isolated_gateway.start("scn_motor_overload", realtime=False)
    assert received
    assert received.index("MOTOR_301_CURRENT") < received.index("BUS_101_V")


def test_scenario_runner_avoids_alarm_dag_and_gateway_imports():
    script = (
        "import sys; "
        "import app.runtime.simulator.scenario_runner; "
        f"prefixes = {SIMULATOR_FORBIDDEN_PREFIXES!r}; "
        "mods = sorted(m for m in sys.modules if any(m.startswith(p) for p in prefixes)); "
        "print(mods)"
    )
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=API_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "[]"


def test_start_scenario_api_unknown_id(client: TestClient):
    response = client.post(
        "/api/scenarios/scn_missing/start",
        headers=_auth_header(client),
    )
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "SCENARIO_NOT_FOUND"


def test_start_scenario_api_success(client: TestClient):
    response = client.post(
        "/api/scenarios/scn_motor_overload/start",
        headers=_auth_header(client),
    )
    assert response.status_code == 200
    assert response.json()["scenario_id"] == "scn_motor_overload"