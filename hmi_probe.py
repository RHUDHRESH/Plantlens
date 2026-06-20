#!/usr/bin/env python3
"""Read-only Modbus TCP probe for the IT7070E HMI bridge."""

from __future__ import annotations

import argparse
import sys
from typing import Any

from pymodbus.client import ModbusTcpClient


def parse_ports(raw: str) -> list[int]:
    values: list[int] = []
    for chunk in raw.split(","):
        try:
            value = int(chunk.strip())
        except ValueError:
            continue
        if value not in values:
            values.append(value)
    return values or [502, 5000]


def read_holding(client: Any, address: int, count: int, slave: int) -> Any:
    try:
        return client.read_holding_registers(address, count=count, device_id=slave)
    except TypeError:
        try:
            return client.read_holding_registers(address, count=count, slave=slave)
        except TypeError:
            return client.read_holding_registers(address, count, unit=slave)


def main() -> int:
    parser = argparse.ArgumentParser(description="Probe HMI Modbus TCP using FC03 only.")
    parser.add_argument("--host", default="192.168.1.10")
    parser.add_argument("--ports", default="502,5000")
    parser.add_argument("--slave", type=int, default=1)
    parser.add_argument("--timeout", type=float, default=3.0)
    parser.add_argument("--retries", type=int, default=0)
    parser.add_argument("--address", type=int, default=0)
    parser.add_argument("--count", type=int, default=40)
    args = parser.parse_args()

    found = False
    for port in parse_ports(args.ports):
        client: ModbusTcpClient | None = None
        try:
            client = ModbusTcpClient(args.host, port=port, timeout=args.timeout, retries=args.retries)
            if not client.connect():
                print(f"FAIL: {args.host}:{port} TCP connect failed")
                continue
            result = read_holding(client, args.address, args.count, args.slave)
            if result.isError():
                print(f"FAIL: {args.host}:{port} Modbus error: {result}")
                continue
            print(f"HMI Modbus TCP LIVE: host={args.host} port={port} slave={args.slave} regs={list(result.registers)}")
            found = True
        except Exception as exc:
            print(f"FAIL: {args.host}:{port} {exc}")
        finally:
            if client is not None:
                client.close()

    if not found:
        print("FAIL: no HMI Modbus TCP response found")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
