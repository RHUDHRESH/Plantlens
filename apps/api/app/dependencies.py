"""Shared FastAPI dependencies (injected with Depends())."""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import open_session
from app.runtime.runtime_state import RuntimeState, runtime_state
from app.runtime.websocket_hub import WebSocketHub, websocket_hub


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async DB session with commit/rollback/close handling."""
    async for session in open_session():
        yield session


def get_runtime_state() -> RuntimeState:
    return runtime_state


def get_ws_hub() -> WebSocketHub:
    return websocket_hub