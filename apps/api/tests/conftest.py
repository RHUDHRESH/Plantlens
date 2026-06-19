"""Shared pytest fixtures for API tests."""

import asyncio

import pytest
from fastapi.testclient import TestClient

from app.db import models  # noqa: F401 — register ORM metadata
from app.db.base import Base
from app.db.session import dispose_db_engine, get_session_factory
from app.settings import get_settings


@pytest.fixture(autouse=True)
def use_in_memory_database(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep health tests off repo-root SQLite files."""
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    monkeypatch.setenv("PLANTLENS_ENV", "test")
    monkeypatch.setenv("PLANTLENS_DEV_JWT_SECRET", "test-secret-for-pytest")
    get_settings.cache_clear()


@pytest.fixture
def client() -> TestClient:
    from app.main import create_app

    get_settings.cache_clear()

    async def _create_schema() -> None:
        factory = get_session_factory()
        async with factory() as session:
            conn = await session.connection()
            await conn.run_sync(Base.metadata.create_all)
            await session.commit()

    with TestClient(create_app()) as test_client:
        asyncio.run(_create_schema())
        yield test_client

    asyncio.run(dispose_db_engine())
    get_settings.cache_clear()