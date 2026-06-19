"""Async SQLAlchemy engine and session lifecycle (no import-time initialization)."""

from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None
_bound_database_url: str | None = None


def init_db_engine(database_url: str, *, echo: bool = False) -> None:
    """Create the async engine and session factory. Must not run at import time."""
    global _engine, _session_factory, _bound_database_url
    if _engine is not None:
        msg = "Database engine already initialized; dispose before re-initializing"
        raise RuntimeError(msg)
    _bound_database_url = database_url
    _engine = create_async_engine(database_url, echo=echo, pool_pre_ping=True)
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False)


async def dispose_db_engine() -> None:
    """Dispose engine and clear session factory."""
    global _engine, _session_factory, _bound_database_url
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None
    _bound_database_url = None


def is_db_initialized() -> bool:
    return _engine is not None and _session_factory is not None


def get_bound_database_url() -> str | None:
    return _bound_database_url


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    if _session_factory is None:
        msg = "Database not initialized; call init_db_engine() during app lifespan"
        raise RuntimeError(msg)
    return _session_factory


async def open_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield a session with commit/rollback/close handling."""
    session_factory = get_session_factory()
    async with session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def check_database_connectivity() -> bool:
    """Lightweight readiness probe; does not expose connection details."""
    if not is_db_initialized():
        return False
    session_factory = get_session_factory()
    async with session_factory() as session:
        await session.execute(text("SELECT 1"))
    return True


def reset_db_state_for_tests() -> None:
    """Test-only helper when dispose could not run (sync teardown)."""
    global _engine, _session_factory, _bound_database_url
    _engine = None
    _session_factory = None
    _bound_database_url = None