"""In-process Modbus TCP simulator for gateway tests."""

from __future__ import annotations

import asyncio

from pymodbus.datastore import ModbusDeviceContext, ModbusSequentialDataBlock, ModbusServerContext
from pymodbus.server import StartAsyncTcpServer


async def start_modbus_tcp_simulator(
    *,
    host: str = "127.0.0.1",
    port: int = 5020,
    holding_registers: dict[int, int] | None = None,
) -> asyncio.Task:
    """Start async TCP server with preloaded holding registers."""
    values = [0] * 256
    for address, value in (holding_registers or {}).items():
        idx = address - 1
        if 0 <= idx < len(values):
            values[idx] = value & 0xFFFF
    store = ModbusDeviceContext(hr=ModbusSequentialDataBlock(1, values))
    context = ModbusServerContext(devices=store, single=True)

    async def _run() -> None:
        await StartAsyncTcpServer(context=context, address=(host, port))

    return asyncio.create_task(_run())


def float32_be_to_registers(value: float) -> tuple[int, int]:
    import struct

    packed = struct.pack(">f", value)
    hi, lo = struct.unpack(">HH", packed)
    return hi, lo