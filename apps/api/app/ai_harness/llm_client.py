"""OpenAI-compatible chat completions client (Ollama / local LLM).

Used only for draft/explain narration from packed RuntimeEvidencePacket context.
Never diagnoses live faults and never writes hardware.

All network I/O uses httpx.AsyncClient so FastAPI routes do not block the event loop.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import httpx

from app.settings import Settings, get_settings

HEALTH_CACHE_TTL_S = 15.0


@dataclass(frozen=True, slots=True)
class LlmHealth:
    enabled: bool
    healthy: bool
    base_url: str
    model: str
    detail: str = ""


@dataclass(frozen=True, slots=True)
class LlmChatResult:
    content: str
    model: str
    provider: str = "openai_compatible"


class LlmClientError(Exception):
    """Raised when the LLM provider is unavailable or returns an error."""


# TTL cache for health checks — process-local, advisory only.
_health_cache: dict[str, tuple[float, LlmHealth]] = {}


def _chat_url(base_url: str) -> str:
    return f"{base_url.rstrip('/')}/v1/chat/completions"


def _models_url(base_url: str) -> str:
    return f"{base_url.rstrip('/')}/v1/models"


def _auth_headers(settings: Settings) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    api_key = getattr(settings, "plantlens_llm_api_key", None) or ""
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def _cache_key(settings: Settings) -> str:
    return f"{settings.plantlens_llm_base_url}|{settings.plantlens_llm_model}|{settings.plantlens_llm_enabled}"


def clear_llm_health_cache() -> None:
    """Test helper — drop cached health results."""
    _health_cache.clear()


async def acheck_llm_health(
    settings: Settings | None = None,
    *,
    force: bool = False,
) -> LlmHealth:
    """Async health check with ~15s TTL cache. Does not raise."""
    cfg = settings or get_settings()
    base = cfg.plantlens_llm_base_url
    model = cfg.plantlens_llm_model
    if not cfg.plantlens_llm_enabled:
        return LlmHealth(
            enabled=False,
            healthy=False,
            base_url=base,
            model=model,
            detail="PLANTLENS_LLM_ENABLED is false",
        )

    key = _cache_key(cfg)
    now = time.monotonic()
    if not force:
        cached = _health_cache.get(key)
        if cached is not None:
            expires_at, health = cached
            if now < expires_at:
                return health

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(_models_url(base), headers=_auth_headers(cfg))
            if resp.status_code >= 400:
                health = LlmHealth(
                    enabled=True,
                    healthy=False,
                    base_url=base,
                    model=model,
                    detail=f"models endpoint HTTP {resp.status_code}",
                )
            else:
                health = LlmHealth(
                    enabled=True,
                    healthy=True,
                    base_url=base,
                    model=model,
                    detail="ok",
                )
    except Exception as exc:
        health = LlmHealth(
            enabled=True,
            healthy=False,
            base_url=base,
            model=model,
            detail=f"{exc.__class__.__name__}: {exc}",
        )

    _health_cache[key] = (now + HEALTH_CACHE_TTL_S, health)
    return health


async def achat_completions(
    messages: list[dict[str, str]],
    *,
    settings: Settings | None = None,
    temperature: float = 0.2,
    max_tokens: int = 800,
    response_format: dict[str, Any] | None = None,
) -> LlmChatResult:
    """Async OpenAI-compatible /v1/chat/completions.

    Raises LlmClientError when disabled, unhealthy, or the request fails.
    """
    cfg = settings or get_settings()
    if not cfg.plantlens_llm_enabled:
        raise LlmClientError("LLM disabled (PLANTLENS_LLM_ENABLED=false)")

    payload: dict[str, Any] = {
        "model": cfg.plantlens_llm_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if response_format is not None:
        payload["response_format"] = response_format

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                _chat_url(cfg.plantlens_llm_base_url),
                json=payload,
                headers=_auth_headers(cfg),
            )
    except Exception as exc:
        raise LlmClientError(f"LLM request failed: {exc}") from exc

    if resp.status_code >= 400:
        raise LlmClientError(f"LLM HTTP {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise LlmClientError("LLM response missing choices[0].message.content") from exc

    if not isinstance(content, str) or not content.strip():
        raise LlmClientError("LLM returned empty content")

    return LlmChatResult(
        content=content.strip(),
        model=str(data.get("model") or cfg.plantlens_llm_model),
    )


# ---------------------------------------------------------------------------
# Sync wrappers — prefer async paths in FastAPI; keep for unit tests / scripts
# ---------------------------------------------------------------------------


def check_llm_health(settings: Settings | None = None) -> LlmHealth:
    """Sync health check (blocks). Prefer acheck_llm_health in async routes."""
    import asyncio

    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(acheck_llm_health(settings))
    raise LlmClientError("check_llm_health cannot run inside an active event loop; use acheck_llm_health")


def chat_completions(
    messages: list[dict[str, str]],
    *,
    settings: Settings | None = None,
    temperature: float = 0.2,
    max_tokens: int = 800,
    response_format: dict[str, Any] | None = None,
) -> LlmChatResult:
    """Sync chat (blocks). Prefer achat_completions in async routes."""
    import asyncio

    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(
            achat_completions(
                messages,
                settings=settings,
                temperature=temperature,
                max_tokens=max_tokens,
                response_format=response_format,
            )
        )
    raise LlmClientError("chat_completions cannot run inside an active event loop; use achat_completions")
