"""Legacy pymodbus client factory (kept for tools/tests; the gateway itself uses
:mod:`gateway.modbus.transports` + :mod:`gateway.modbus.scan_engine`).

Timeouts and retries are explicit (the pymodbus defaults of 3 s x 3 retries made a silent slave
cost 12 s per request), and a missing port is resolved through VID/PID discovery instead of a
hard-coded ``/dev/ttyUSB0`` or ``COM3``.
"""

from __future__ import annotations

from typing import Any

import structlog
from pymodbus.client import AsyncModbusSerialClient, AsyncModbusTcpClient

from gateway.transport.discovery import resolve

log = structlog.get_logger()

DEFAULT_TIMEOUT_S = 0.25
DEFAULT_RETRIES = 1


def create_client(
    source: dict[str, Any],
    *,
    serial_port_override: str | None = None,
    timeout: float = DEFAULT_TIMEOUT_S,
    retries: int = DEFAULT_RETRIES,
) -> AsyncModbusSerialClient | AsyncModbusTcpClient:
    protocol = source.get("protocol", "modbus_rtu")
    if protocol == "modbus_tcp":
        host = source.get("host", "127.0.0.1")
        port = int(source.get("port", 502))
        return AsyncModbusTcpClient(host=host, port=port, timeout=timeout, retries=retries)
    serial = source.get("serial", {})
    port = serial_port_override or serial.get("port")
    if not port:
        port = resolve(None).device
    return AsyncModbusSerialClient(
        port=port,
        baudrate=int(serial.get("baudrate", 9600)),
        parity=serial.get("parity", "N"),
        stopbits=int(serial.get("stopbits", 1)),
        bytesize=int(serial.get("bytesize", 8)),
        timeout=timeout,
        retries=retries,
    )


async def ensure_connected(client: AsyncModbusSerialClient | AsyncModbusTcpClient) -> bool:
    if client.connected:
        return True
    connected = await client.connect()
    if not connected:
        log.warning("modbus_connect_failed")
    return bool(connected)
