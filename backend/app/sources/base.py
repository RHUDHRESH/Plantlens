"""SourceAdapter interface — THE portability boundary (Domain C).

Law #1: PlantLens reads, never writes. This ABC exposes NO write methods.
Everything above this boundary operates on CanonicalValue only; nothing above
ever sees a register number or OPC-UA node id. Swapping Modbus -> OPC-UA is a
config line: nothing above sources/ changes.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from ..schemas.canonical import CanonicalValue


class SourceAdapter(ABC):
    """Read-only contract every source (sim / modbus / opcua) implements."""

    id: str = "base"

    @abstractmethod
    async def read(self) -> list[CanonicalValue]:
        """Return canonical values for the current tick. Must be deterministic."""
        raise NotImplementedError

    async def health(self) -> dict:
        """Connection heartbeat / last-good-timestamp. Read-only by construction."""
        return {"id": self.id, "healthy": True}

    # NOTE: there are intentionally no write() / write_register() / call() methods.
    # Adding one breaks Law #1 and destroys the read-only security posture
    # (IEC 62443 defense-in-depth: no write path = prompt-injection cannot escalate).
