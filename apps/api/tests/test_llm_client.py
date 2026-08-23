"""LLM client + provider health settings tests."""

from __future__ import annotations

from app.ai_harness.llm_client import check_llm_health, clear_llm_health_cache
from app.settings import get_settings


def test_llm_health_reports_disabled(monkeypatch):
    monkeypatch.setenv("PLANTLENS_LLM_ENABLED", "false")
    get_settings.cache_clear()
    clear_llm_health_cache()
    try:
        health = check_llm_health(get_settings())
        assert health.enabled is False
        assert health.healthy is False
        assert "false" in health.detail.lower() or "enabled" in health.detail.lower()
    finally:
        get_settings.cache_clear()
        clear_llm_health_cache()


def test_settings_expose_llm_env(monkeypatch):
    monkeypatch.setenv("PLANTLENS_LLM_ENABLED", "true")
    monkeypatch.setenv("PLANTLENS_LLM_BASE_URL", "http://127.0.0.1:11434")
    monkeypatch.setenv("PLANTLENS_LLM_MODEL", "llama3.2")
    monkeypatch.setenv("PLANTLENS_LLM_API_KEY", "secret")
    get_settings.cache_clear()
    try:
        settings = get_settings()
        assert settings.plantlens_llm_enabled is True
        assert settings.plantlens_llm_base_url == "http://127.0.0.1:11434"
        assert settings.plantlens_llm_model == "llama3.2"
        assert settings.plantlens_llm_api_key == "secret"
    finally:
        get_settings.cache_clear()
