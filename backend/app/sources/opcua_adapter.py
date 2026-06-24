"""OPC-UA adapter (Domain C / V) — asyncua 2.0 (production swap).

READ-ONLY. asyncua Client(url).connect() -> node.read_value(). Maps OPC-UA
Alarms & Conditions namespace into CanonicalValue + NE 107 status. By contract
identical to ModbusAdapter from the engine's perspective.
"""
from __future__ import annotations

from ..schemas.canonical import CanonicalValue
from .base import SourceAdapter


class OpcUaAdapter(SourceAdapter):
    id = "opcua"

    def __init__(self, url: str = "opc.tcp://localhost:4840") -> None:
        self.url = url
        self._client = None

    async def read(self) -> list[CanonicalValue]:
        # Scaffold: real reads require `from asyncua import Client`.
        # Planned: async with Client(self.url) as c: node = await c.get_node(id); v = await node.read_value()
        return []
