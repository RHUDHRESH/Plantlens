"""LLM client async path + conversation demotion tests (mocked httpx)."""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.ai_harness.conversation_service import answer_message
from app.ai_harness.intents import Intent
from app.ai_harness.llm_client import (
    acheck_llm_health,
    achat_completions,
    clear_llm_health_cache,
)
from app.settings import get_settings


def _motor_ep() -> dict[str, Any]:
    return {
        "evidence_id": "EV_LLM_001",
        "plant_id": "demo",
        "root_asset_id": "MTR-301",
        "situation_type": "MOTOR_MECHANICAL_OVERLOAD",
        "situation_id": "SIT_001",
        "confidence": 0.85,
        "confidence_reason": "Motor current preceded bus sag.",
        "ts": "2026-01-01T10:00:00Z",
        "runtime_bundle_version": "1.0.0",
        "source_frame_ids": [],
        "active_alarm_ids": ["MOTOR_CURRENT_HIGH"],
        "grouped_alarm_ids": ["MOTOR_CURRENT_HIGH"],
        "stale_or_bad_tags": [],
        "missing_tags": [],
        "blocked_actions": [],
        "recommended_checks": [],
        "deterministic_trace_id": "TRACE_LLM_001",
        "evidence_chain": [
            {
                "order": 1,
                "asset_id": "MTR-301",
                "alarm_id": "MOTOR_CURRENT_HIGH",
                "role": "first_signal",
                "first_seen_ts": "2026-01-01T10:00:00Z",
                "quality": "GOOD",
                "explanation": "Motor current exceeded limit.",
            }
        ],
        "causal_path": [],
        "rejected_candidates": [],
    }


def _snapshot(ep: dict | None = None) -> dict[str, Any]:
    return {
        "tags": {},
        "active_alarms": {
            "MOTOR_CURRENT_HIGH": {
                "alarm_id": "MOTOR_CURRENT_HIGH",
                "raised_at": "2026-01-01T10:00:00Z",
            }
        },
        "active_situations": [
            {
                "situation_id": "SIT_001",
                "root_asset_id": "MTR-301",
                "situation_type": "MOTOR_MECHANICAL_OVERLOAD",
            }
        ],
        "latest_calm_card": None,
        "latest_evidence_packet": ep,
        "asset_status": {},
    }


@pytest.fixture(autouse=True)
def _clear_health_cache():
    clear_llm_health_cache()
    get_settings.cache_clear()
    yield
    clear_llm_health_cache()
    get_settings.cache_clear()


def _mock_response(*, status_code: int = 200, json_data: Any = None, text: str = "") -> MagicMock:
    resp = MagicMock()
    resp.status_code = status_code
    resp.text = text
    resp.json.return_value = json_data if json_data is not None else {}
    return resp


@pytest.mark.asyncio
async def test_achat_completions_json_success(monkeypatch):
    monkeypatch.setenv("PLANTLENS_LLM_ENABLED", "true")
    monkeypatch.setenv("PLANTLENS_LLM_BASE_URL", "http://llm.test")
    monkeypatch.setenv("PLANTLENS_LLM_API_KEY", "test-key")
    get_settings.cache_clear()

    payload = {
        "choices": [{"message": {"content": '{"summary":"ok","answer":"Root is MTR-301."}'}}],
        "model": "llama3.2",
    }
    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = None
    mock_client.post = AsyncMock(return_value=_mock_response(json_data=payload))

    with patch("app.ai_harness.llm_client.httpx.AsyncClient", return_value=mock_client):
        result = await achat_completions(
            [{"role": "user", "content": "hi"}],
            settings=get_settings(),
        )

    assert "MTR-301" in result.content
    call_kwargs = mock_client.post.await_args
    headers = call_kwargs.kwargs.get("headers") or call_kwargs[1].get("headers")
    assert headers["Authorization"] == "Bearer test-key"


@pytest.mark.asyncio
async def test_health_ttl_cache_avoids_repeat_calls(monkeypatch):
    monkeypatch.setenv("PLANTLENS_LLM_ENABLED", "true")
    monkeypatch.setenv("PLANTLENS_LLM_BASE_URL", "http://llm.test")
    get_settings.cache_clear()

    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = None
    mock_client.get = AsyncMock(return_value=_mock_response(json_data={"data": []}))

    with patch("app.ai_harness.llm_client.httpx.AsyncClient", return_value=mock_client):
        h1 = await acheck_llm_health(get_settings())
        h2 = await acheck_llm_health(get_settings())

    assert h1.healthy is True
    assert h2.healthy is True
    assert mock_client.get.await_count == 1


@pytest.mark.asyncio
async def test_llm_json_success_enriches_answer(monkeypatch):
    monkeypatch.setenv("PLANTLENS_LLM_ENABLED", "true")
    monkeypatch.setenv("PLANTLENS_LLM_BASE_URL", "http://llm.test")
    get_settings.cache_clear()

    llm_body = {
        "summary": "LLM root cause",
        "answer": "Evidence shows MTR-301 is the root via MOTOR_CURRENT_HIGH.",
        "cited_assets": ["MTR-301"],
        "cited_alarms": ["MOTOR_CURRENT_HIGH"],
        "cited_edges": [],
        "limitations": [],
        "confidence": 0.8,
        "requires_human_approval": False,
        "draft_artifact": None,
    }
    chat_payload = {
        "choices": [{"message": {"content": json.dumps(llm_body)}}],
        "model": "llama3.2",
    }

    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = None
    mock_client.get = AsyncMock(return_value=_mock_response(json_data={"data": []}))
    mock_client.post = AsyncMock(return_value=_mock_response(json_data=chat_payload))

    with patch("app.ai_harness.llm_client.httpx.AsyncClient", return_value=mock_client):
        response = await answer_message(
            "what is the root cause?",
            role="operator",
            snapshot=_snapshot(ep=_motor_ep()),
            settings=get_settings(),
        )

    assert response.intent == str(Intent.EXPLAIN_ROOT_CAUSE)
    assert any("llm_narration" in lim.lower() for lim in response.limitations)
    assert "MTR-301" in response.answer


@pytest.mark.asyncio
async def test_guard_demotion_falls_back_to_deterministic(monkeypatch):
    """LLM answer that trips hardware guard is demoted to deterministic builder."""
    monkeypatch.setenv("PLANTLENS_LLM_ENABLED", "true")
    monkeypatch.setenv("PLANTLENS_LLM_BASE_URL", "http://llm.test")
    get_settings.cache_clear()

    llm_body = {
        "summary": "bad",
        "answer": "You should write to plc and trip breaker now.",
        "cited_assets": ["MTR-301"],
        "cited_alarms": [],
        "cited_edges": [],
        "limitations": [],
        "confidence": 0.9,
        "requires_human_approval": False,
        "draft_artifact": None,
    }
    chat_payload = {
        "choices": [{"message": {"content": json.dumps(llm_body)}}],
        "model": "llama3.2",
    }

    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = None
    mock_client.get = AsyncMock(return_value=_mock_response(json_data={"data": []}))
    mock_client.post = AsyncMock(return_value=_mock_response(json_data=chat_payload))

    with patch("app.ai_harness.llm_client.httpx.AsyncClient", return_value=mock_client):
        response = await answer_message(
            "what is the root cause?",
            role="operator",
            snapshot=_snapshot(ep=_motor_ep()),
            settings=get_settings(),
        )

    # Demoted — deterministic path, no LLM narration marker
    assert response.intent == str(Intent.EXPLAIN_ROOT_CAUSE)
    assert "MTR-301" in response.answer
    assert "write to plc" not in response.answer.lower()
    assert not any("llm_narration" in lim.lower() for lim in response.limitations)


@pytest.mark.asyncio
async def test_refuse_hardware_still_works_with_llm_enabled(monkeypatch):
    monkeypatch.setenv("PLANTLENS_LLM_ENABLED", "true")
    monkeypatch.setenv("PLANTLENS_LLM_BASE_URL", "http://llm.test")
    get_settings.cache_clear()

    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = None
    mock_client.get = AsyncMock(return_value=_mock_response(json_data={"data": []}))

    with patch("app.ai_harness.llm_client.httpx.AsyncClient", return_value=mock_client):
        response = await answer_message(
            "write to plc output coil",
            role="engineer",
            snapshot=_snapshot(ep=_motor_ep()),
            settings=get_settings(),
        )

    assert response.intent == str(Intent.UNKNOWN_UNSAFE)
    assert "plc" in response.answer.lower() or "hardware" in response.answer.lower()
    assert mock_client.post.await_count == 0
