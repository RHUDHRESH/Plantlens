#!/usr/bin/env python3
"""Read-only Modbus RTU scout for an EASY302 USB-RS485 link."""

from __future__ import annotations

import argparse
import sys
from typing import Any

import serial.tools.list_ports
from pymodbus.client import ModbusSerialClient


DEFAULT_BAUDS = [9600, 19200, 38400, 115200]
DEFAULT_SLAVES = [1, 2, 3, 4, 5]


def parse_csv_ints(raw: str, default: list[int]) -> list[int]:
    if not raw:
        return default
    values: list[int] = []
    for chunk in raw.split(","):
        try:
            value = int(chunk.strip())
        except ValueError:
            continue
        if value not in values:
            values.append(value)
    return values or default


def parse_csv_strs(raw: str) -> list[str]:
    return [chunk.strip() for chunk in raw.split(",") if chunk.strip()]


def create_client(port: str, baud: int, parity: str, timeout: float, retries: int) -> ModbusSerialClient:
    try:
        return ModbusSerialClient(
            port=port,
            baudrate=baud,
            stopbits=1,
            bytesize=8,
            parity=parity,
            timeout=timeout,
            retries=retries,
        )
    except TypeError:
        return ModbusSerialClient(
            method="rtu",
            port=port,
            baudrate=baud,
            stopbits=1,
            bytesize=8,
            parity=parity,
            timeout=timeout,
        )


def read_holding(client: Any, address: int, count: int, slave: int) -> Any:
    try:
        return client.read_holding_registers(address, count=count, device_id=slave)
    except TypeError:
        try:
            return client.read_holding_registers(address, count=count, slave=slave)
        except TypeError:
            return client.read_holding_registers(address, count, unit=slave)


def serial_ports(include_bluetooth: bool) -> list[tuple[str, str]]:
    ports = list(serial.tools.list_ports.comports())

    def rank(port: Any) -> tuple[int, str]:
        desc = (port.description or "").lower()
        if "usb" in desc or "ch343" in desc or "rs485" in desc or "wch" in desc:
            return (0, port.device)
        if "bluetooth" in desc:
            return (3, port.device)
        return (1, port.device)

    result: list[tuple[str, str]] = []
    for port in sorted(ports, key=rank):
        desc = port.description or ""
        if not include_bluetooth and "bluetooth" in desc.lower():
            continue
        result.append((port.device, desc))
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Scan Modbus RTU ports using FC03 only.")
    parser.add_argument("--ports", default="", help="Comma-separated COM ports. Defaults to detected non-Bluetooth ports.")
    parser.add_argument("--bauds", default=",".join(str(v) for v in DEFAULT_BAUDS))
    parser.add_argument("--slaves", default=",".join(str(v) for v in DEFAULT_SLAVES))
    parser.add_argument("--parity", default="N")
    parser.add_argument("--timeout", type=float, default=0.5)
    parser.add_argument("--retries", type=int, default=0)
    parser.add_argument("--address", type=int, default=0)
    parser.add_argument("--count", type=int, default=2)
    parser.add_argument("--include-bluetooth", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    if args.ports:
        ports = [(port, "configured") for port in parse_csv_strs(args.ports)]
    else:
        ports = serial_ports(args.include_bluetooth)

    if not ports:
        print("FAIL: no serial ports found")
        return 1

    bauds = parse_csv_ints(args.bauds, DEFAULT_BAUDS)
    slaves = parse_csv_ints(args.slaves, DEFAULT_SLAVES)

    print("PORTS:", flush=True)
    for port, desc in ports:
        print(f"  {port}  {desc}", flush=True)

    found = False
    for port, _desc in ports:
        for baud in bauds:
            for slave in slaves:
                client: ModbusSerialClient | None = None
                try:
                    if args.verbose:
                        print(f"TRY: port={port} baud={baud} slave={slave}", flush=True)
                    client = create_client(port, baud, args.parity.upper(), args.timeout, args.retries)
                    if not client.connect():
                        continue
                    result = read_holding(client, args.address, args.count, slave)
                    if not result.isError():
                        print(f"FOUND: port={port} baud={baud} slave={slave} regs={list(result.registers)}", flush=True)
                        found = True
                except PermissionError as exc:
                    print(f"ERROR: port={port} permission denied: {exc}", flush=True)
                except Exception as exc:
                    if args.verbose:
                        print(f"ERROR: port={port} baud={baud} slave={slave}: {exc}", flush=True)
                finally:
                    if client is not None:
                        client.close()

    if not found:
        print("FAIL: no Modbus RTU response found", flush=True)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
