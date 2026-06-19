"""Modbus serial/TCP client with reconnect."""

from __future__ import annotations

from typing import Any

import structlog
from pymodbus.client import AsyncModbusSerialClient, AsyncModbusTcpClient

log = structlog.get_logger()


def create_client(source: dict[str, Any]) -> AsyncModbusSerialClient | AsyncModbusTcpClient:
    protocol = source.get("protocol", "modbus_rtu")
    if protocol == "modbus_tcp":
        host = source.get("host", "127.0.0.1")
        port = int(source.get("port", 5020))
        return AsyncModbusTcpClient(host=host, port=port)
    serial = source.get("serial", {})
    return AsyncModbusSerialClient(
        port=serial.get("port", "/dev/ttyUSB0"),
        baudrate=int(serial.get("baudrate", 9600)),
        parity=serial.get("parity", "N"),
        stopbits=int(serial.get("stopbits", 1)),
        bytesize=int(serial.get("bytesize", 8)),
    )


async def ensure_connected(client: AsyncModbusSerialClient | AsyncModbusTcpClient) -> bool:
    if client.connected:
        return True
    connected = await client.connect()
    if not connected:
        log.warning("modbus_connect_failed")
    return bool(connected)