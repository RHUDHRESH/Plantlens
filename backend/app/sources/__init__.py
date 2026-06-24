"""Sources package — the portability boundary.

Law #1 enforced here: SourceAdapter exposes read() and health() ONLY.
"""
from .base import SourceAdapter
from .sim_adapter import SimAdapter


def get_adapter(source: str = "sim", **kw) -> SourceAdapter:
    """Factory gated on config (PLANTLENS_SOURCE). Only read adapters exist."""
    if source == "sim":
        return SimAdapter(**kw)
    if source == "modbus":
        from .modbus_adapter import ModbusAdapter
        return ModbusAdapter(**kw)
    if source == "opcua":
        from .opcua_adapter import OpcUaAdapter
        return OpcUaAdapter(**kw)
    raise ValueError(f"unknown source: {source}")


__all__ = ["SourceAdapter", "SimAdapter", "get_adapter"]
