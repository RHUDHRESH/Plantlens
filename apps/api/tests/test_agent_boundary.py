"""Runtime/agent boundary integration test."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import pytest

from app.runtime.config_loader import reset_runtime_config_for_tests
from app.runtime.runtime_state import RuntimeState
from app.runtime.simulator.scenario_runner import ScenarioRunner
from app.runtime.simulator.simulator_gateway import SimulatorGateway, reset_simulator_gateway_for_tests
from app.runtime.websocket_hub import WebSocketHub

REPO_ROOT = Path(__file__).resolve().parents[3]
DEMO_DIR = REPO_ROOT / "packages" / "sample-data" / "demo-microgrid"
AGENTS_ROOT = REPO_ROOT / "apps" / "agents"


@pytest.fixture(autouse=True)
def reset_singletons() -> None:
    reset_runtime_config_for_tests()
    reset_simulator_gateway_for_tests()
    yield
    reset_runtime_config_for_tests()
    reset_simulator_gateway_for_tests()


def test_agent_explainer_references_evidence_only():
    sys.path.insert(0, str(AGENTS_ROOT))
    from agents.registry import run_agent

    runner = ScenarioRunner(
        scenarios_path=DEMO_DIR / "scenarios.json",
        tag_map_path=DEMO_DIR / "tag_map.json",
    )
    gateway = SimulatorGateway(state=RuntimeState(), hub=WebSocketHub(), runner=runner)
    state = asyncio.run(_run_gateway(gateway))
    packet = state.latest_evidence_packet
    assert packet is not None
    root_before = packet["root_asset_id"]

    result = run_agent(
        "alarm_explainer",
        {"context": {"evidence_packet": packet}},
    )
    assert result["artifact_type"] == "alarm_explanation"
    assert result["proposed_changes"] == []
    assert "MTR-301" in result["explanation"] or root_before in result["explanation"]
    assert packet["root_asset_id"] == root_before


async def _run_gateway(gateway: SimulatorGateway) -> RuntimeState:
    await gateway.start("scn_motor_overload", realtime=False)
    return gateway._state


def test_agent_outage_fallback_no_fabricated_edge(client):
    response = client.post(
        "/api/agents/graph-draft",
        json={"prompt": "add edge"},
        headers=_token(client, "engineer"),
    )
    assert response.status_code == 200
    payload = response.json()["draft"]["payload"]
    assert payload["artifact_type"] == "service_unavailable"
    assert payload["proposed_changes"] == []


def _token(client, role: str) -> dict[str, str]:
    token = client.post(
        "/internal/auth-test/dev-token",
        json={"role": role, "subject": "boundary-test"},
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}