#!/usr/bin/env python3
"""BMS Cloud Bridge for Inovance EASY302 over USB-RS485.

The bridge is read-only against the PLC. It polls Modbus holding registers,
serves a local REST/dashboard interface, stores readings in SQLite, emits
Socket.IO updates, and optionally publishes MQTT.
"""

from __future__ import annotations

import json
import logging
import math
import os
import sqlite3
import struct
import threading
import time
from datetime import datetime, timezone
from typing import Any

import paho.mqtt.client as mqtt
import serial.tools.list_ports
from flask import Flask, jsonify, request
from flask_socketio import SocketIO
from pymodbus.client import ModbusSerialClient, ModbusTcpClient


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DB_PATH = os.getenv("BMS_DB_PATH", "bms_history.db")
MQTT_TOPIC = os.getenv("BMS_MQTT_TOPIC", "bms/easy302/live")
READ_START = 0
READ_COUNT = 40
MISMATCH_THRESHOLD = 0.05


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def parse_int_list(raw: str | None, default: list[int]) -> list[int]:
    if not raw:
        return list(default)
    values: list[int] = []
    for chunk in raw.split(","):
        try:
            value = int(chunk.strip())
        except ValueError:
            continue
        if value not in values:
            values.append(value)
    return values or list(default)


def parse_str_list(raw: str | None, default: list[str]) -> list[str]:
    if not raw:
        return list(default)
    values = [chunk.strip() for chunk in raw.split(",") if chunk.strip()]
    return values or list(default)


RUNTIME_CONFIG: dict[str, Any] = {
    "plc_enabled": env_bool("BMS_PLC_ENABLED", True),
    "hmi_enabled": env_bool("BMS_HMI_ENABLED", True),
    "simulate": env_bool("BMS_SIMULATE", False),
    "com_port": os.getenv("BMS_COM_PORT", "auto"),
    "baud_rate": env_int("BMS_BAUD_RATE", 9600),
    "parity": os.getenv("BMS_PARITY", "N").upper(),
    "slave_id": env_int("BMS_SLAVE_ID", 1),
    "baud_candidates": parse_int_list(os.getenv("BMS_BAUDS"), [9600, 19200, 38400, 115200]),
    "slave_candidates": parse_int_list(os.getenv("BMS_SLAVES"), [1, 2, 3, 4, 5]),
    "scan_bluetooth": env_bool("BMS_SCAN_BLUETOOTH", False),
    "serial_timeout_s": env_float("BMS_SERIAL_TIMEOUT_S", 1.0),
    "detect_timeout_s": env_float("BMS_DETECT_TIMEOUT_S", 0.5),
    "modbus_retries": env_int("BMS_MODBUS_RETRIES", 0),
    "hmi_host": os.getenv("BMS_HMI_HOST", "192.168.1.10"),
    "hmi_ports": parse_int_list(os.getenv("BMS_HMI_PORTS"), [502, 5000]),
    "hmi_slave_id": env_int("BMS_HMI_SLAVE_ID", 1),
    "hmi_timeout_s": env_float("BMS_HMI_TIMEOUT_S", 2.0),
    "poll_ms": env_int("BMS_POLL_MS", 1000),
    "reconnect_s": env_float("BMS_RECONNECT_S", 10.0),
    "float_word_order": os.getenv("BMS_FLOAT_WORD_ORDER", "swap").lower(),
    "int32_word_order": os.getenv("BMS_INT32_WORD_ORDER", "be").lower(),
    "mqtt_enabled": env_bool("BMS_MQTT_ENABLED", True),
    "mqtt_host": os.getenv("BMS_MQTT_HOST", "broker.emqx.io"),
    "mqtt_port": env_int("BMS_MQTT_PORT", 1883),
    "mqtt_tls": env_bool("BMS_MQTT_TLS", False),
    "mqtt_username": os.getenv("BMS_MQTT_USERNAME", ""),
    "mqtt_password": os.getenv("BMS_MQTT_PASSWORD", ""),
    "mqtt_ca_certs": os.getenv("BMS_MQTT_CA_CERTS", ""),
    "mqtt_certfile": os.getenv("BMS_MQTT_CERTFILE", ""),
    "mqtt_keyfile": os.getenv("BMS_MQTT_KEYFILE", ""),
}

CONFIG_LOCK = threading.RLock()
CONFIG_GENERATION = 0
STATE_LOCK = threading.RLock()
STOP_EVENT = threading.Event()


# ---------------------------------------------------------------------------
# Register map
# ---------------------------------------------------------------------------

REGISTER_MAP: list[dict[str, Any]] = [
    {"name": "solar_volt", "label": "Solar Voltage", "unit": "V", "excel_reg": 1, "addr": 0, "type": "float"},
    {"name": "solar_current", "label": "Solar Current", "unit": "A", "excel_reg": 3, "addr": 2, "type": "float"},
    {"name": "solar_power", "label": "Solar Power", "unit": "W", "excel_reg": 5, "addr": 4, "type": "float"},
    {"name": "mains_volt", "label": "Mains Voltage", "unit": "V", "excel_reg": 7, "addr": 6, "type": "float"},
    {"name": "mains_current", "label": "Mains Current", "unit": "A", "excel_reg": 9, "addr": 8, "type": "float"},
    {"name": "mains_power", "label": "Mains Power", "unit": "W", "excel_reg": 11, "addr": 10, "type": "float"},
    {"name": "battery_volt", "label": "Battery Voltage", "unit": "V", "excel_reg": 13, "addr": 12, "type": "float"},
    {"name": "battery_current", "label": "Battery Current", "unit": "A", "excel_reg": 15, "addr": 14, "type": "float"},
    {"name": "battery_power", "label": "Battery Power", "unit": "W", "excel_reg": 17, "addr": 16, "type": "float"},
    {"name": "inverter_volt", "label": "Inverter Voltage", "unit": "V", "excel_reg": 19, "addr": 18, "type": "float"},
    {"name": "inverter_current", "label": "Inverter Current", "unit": "A", "excel_reg": 21, "addr": 20, "type": "float"},
    {"name": "inverter_power", "label": "Inverter Power", "unit": "W", "excel_reg": 23, "addr": 22, "type": "float"},
    {"name": "vfd_current", "label": "VFD Current", "unit": "A", "excel_reg": 24, "addr": 23, "type": "int", "scale": 10.0},
    {"name": "vfd_volt", "label": "VFD Voltage", "unit": "V", "excel_reg": 25, "addr": 24, "type": "int"},
    {"name": "vfd_power", "label": "VFD Power", "unit": "W", "excel_reg": 26, "addr": 25, "type": "int", "scale": 100.0},
    {"name": "vib_temp", "label": "Vib Sensor Temp", "unit": "degC", "excel_reg": 28, "addr": 27, "type": "int32"},
    {"name": "vib_x", "label": "Vibration X", "unit": "mg", "excel_reg": 30, "addr": 29, "type": "int32"},
    {"name": "vib_y", "label": "Vibration Y", "unit": "mg", "excel_reg": 32, "addr": 31, "type": "int32"},
    {"name": "vib_z", "label": "Vibration Z", "unit": "mg", "excel_reg": 34, "addr": 33, "type": "int32"},
    {"name": "motor_rpm", "label": "Motor RPM", "unit": "RPM", "excel_reg": 37, "addr": 36, "type": "float"},
    {
        "name": "motor_temp",
        "label": "Motor Temperature",
        "unit": "degC",
        "excel_reg": 38,
        "addr": 37,
        "type": "int",
        "note": "May overlap motor_rpm float word; try addr 38 if value is invalid.",
    },
]

PARAM_NAMES = [entry["name"] for entry in REGISTER_MAP]
REGISTER_GROUPS = {
    "Solar": ["solar_volt", "solar_current", "solar_power"],
    "Mains": ["mains_volt", "mains_current", "mains_power"],
    "Battery": ["battery_volt", "battery_current", "battery_power"],
    "Inverter": ["inverter_volt", "inverter_current", "inverter_power"],
    "VFD": ["vfd_volt", "vfd_current", "vfd_power"],
    "Vibration": ["vib_temp", "vib_x", "vib_y", "vib_z"],
    "Motor": ["motor_rpm", "motor_temp"],
}

PARAM_PRECISION = {
    "solar_volt": 1,
    "solar_current": 2,
    "solar_power": 1,
    "mains_volt": 1,
    "mains_current": 2,
    "mains_power": 1,
    "battery_volt": 2,
    "battery_current": 2,
    "battery_power": 1,
    "inverter_volt": 1,
    "inverter_current": 2,
    "inverter_power": 1,
    "vfd_current": 2,
    "vfd_volt": 1,
    "vfd_power": 2,
    "vib_temp": 1,
    "vib_x": 0,
    "vib_y": 0,
    "vib_z": 0,
    "motor_rpm": 1,
    "motor_temp": 1,
}

PARAM_LIMITS = {
    "solar_volt": (0.0, 150.0),
    "solar_current": (-200.0, 200.0),
    "solar_power": (-20000.0, 20000.0),
    "mains_volt": (0.0, 320.0),
    "mains_current": (0.0, 200.0),
    "mains_power": (-30000.0, 30000.0),
    "battery_volt": (10.0, 80.0),
    "battery_current": (-300.0, 300.0),
    "battery_power": (-30000.0, 30000.0),
    "inverter_volt": (0.0, 320.0),
    "inverter_current": (0.0, 200.0),
    "inverter_power": (-30000.0, 30000.0),
    "vfd_current": (0.0, 100.0),
    "vfd_volt": (0.0, 600.0),
    "vfd_power": (-30000.0, 30000.0),
    "vib_temp": (-40.0, 150.0),
    "vib_x": (-20000.0, 20000.0),
    "vib_y": (-20000.0, 20000.0),
    "vib_z": (-20000.0, 20000.0),
    "motor_rpm": (0.0, 10000.0),
    "motor_temp": (-40.0, 180.0),
}


# ---------------------------------------------------------------------------
# Globals
# ---------------------------------------------------------------------------

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

latest_data: dict[str, Any] = {}
source_status: dict[str, dict[str, Any]] = {
    "plc": {"enabled": True, "connected": False, "last_ok": None, "errors": 0, "message": "not started"},
    "hmi": {"enabled": True, "connected": False, "last_ok": None, "errors": 0, "message": "not started"},
    "mqtt": {"enabled": True, "connected": False, "last_ok": None, "errors": 0, "message": "not started"},
    "database": {"connected": False, "last_ok": None, "errors": 0, "path": DB_PATH, "message": "not started"},
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("BMS")


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def utc_ts() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def with_width(entry: dict[str, Any]) -> dict[str, Any]:
    width = 2 if entry["type"] in {"float", "int32"} else 1
    name = entry["name"]
    payload = {**entry, "width": width, "modbus_function": "FC03"}
    payload["precision"] = PARAM_PRECISION.get(name, 3)
    if name in PARAM_LIMITS:
        payload["limits"] = {"min": PARAM_LIMITS[name][0], "max": PARAM_LIMITS[name][1]}
    return payload


def register_map_payload() -> list[dict[str, Any]]:
    return [with_width(entry) for entry in REGISTER_MAP]


def empty_payload(reason: str = "no data yet") -> dict[str, Any]:
    return {
        **{name: None for name in PARAM_NAMES},
        "_ts": utc_ts(),
        "_quality": "NO_DATA",
        "_source": "offline",
        "_source_by_param": {name: "offline" for name in PARAM_NAMES},
        "_mismatches": [],
        "_alarms": [],
        "_reason": reason,
    }


def update_status(section: str, **fields: Any) -> None:
    with STATE_LOCK:
        source_status.setdefault(section, {}).update(fields)


def mark_error(section: str, message: str) -> None:
    with STATE_LOCK:
        status = source_status.setdefault(section, {})
        status["connected"] = False
        status["errors"] = int(status.get("errors", 0)) + 1
        status["last_error"] = message
        status["last_error_ts"] = utc_ts()
        status["message"] = message


def mark_bad_frame(section: str, message: str) -> None:
    with STATE_LOCK:
        status = source_status.setdefault(section, {})
        status["bad_frames"] = int(status.get("bad_frames", 0)) + 1
        status["last_bad_frame_ts"] = utc_ts()
        status["message"] = message


def get_config() -> tuple[dict[str, Any], int]:
    with CONFIG_LOCK:
        return dict(RUNTIME_CONFIG), CONFIG_GENERATION


def safe_config(config: dict[str, Any]) -> dict[str, Any]:
    safe = dict(config)
    for key in list(safe):
        if "password" in key or "keyfile" in key:
            safe[key] = "***" if safe[key] else ""
    return safe


def ordered_candidates(primary: int, candidates: list[int]) -> list[int]:
    values = [primary]
    values.extend(candidates)
    result: list[int] = []
    for value in values:
        if value not in result:
            result.append(value)
    return result


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))


def normalize_engineering_value(name: str, value: float | int | None) -> float | int | None:
    if value is None or not is_number(value):
        return None

    numeric = float(value)
    low, high = PARAM_LIMITS.get(name, (-math.inf, math.inf))
    if numeric < low or numeric > high:
        return None

    if abs(numeric) < 0.000001:
        numeric = 0.0

    precision = PARAM_PRECISION.get(name, 3)
    if precision <= 0:
        return int(round(numeric))
    return round(numeric, precision)


# ---------------------------------------------------------------------------
# Modbus helpers
# ---------------------------------------------------------------------------

def create_serial_client(port: str, baud: int, parity: str, timeout: float, retries: int = 0) -> ModbusSerialClient:
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


def read_holding_registers(client: Any, address: int, count: int, slave_id: int) -> Any:
    try:
        return client.read_holding_registers(address, count=count, device_id=slave_id)
    except TypeError:
        try:
            return client.read_holding_registers(address, count=count, slave=slave_id)
        except TypeError:
            return client.read_holding_registers(address, count, unit=slave_id)


def list_serial_candidates(include_bluetooth: bool) -> list[tuple[str, str]]:
    ports = list(serial.tools.list_ports.comports())

    def rank(port: Any) -> tuple[int, str]:
        desc = (port.description or "").lower()
        device = (port.device or "").lower()
        if "usb" in desc or "ch343" in desc or "rs485" in desc or "wch" in desc:
            return (0, device)
        if "bluetooth" in desc:
            return (3, device)
        return (1, device)

    result: list[tuple[str, str]] = []
    for port in sorted(ports, key=rank):
        description = port.description or ""
        if not include_bluetooth and "bluetooth" in description.lower():
            continue
        result.append((port.device, description))
    return result


def detect_plc_config(config: dict[str, Any]) -> dict[str, Any] | None:
    configured_port = str(config["com_port"]).strip()
    if configured_port and configured_port.lower() != "auto":
        ports = [(configured_port, "configured")]
    else:
        ports = list_serial_candidates(bool(config["scan_bluetooth"]))

    if not ports:
        mark_error("plc", "no serial ports found")
        return None

    bauds = ordered_candidates(int(config["baud_rate"]), list(config["baud_candidates"]))
    slaves = ordered_candidates(int(config["slave_id"]), list(config["slave_candidates"]))

    update_status(
        "plc",
        enabled=bool(config["plc_enabled"]),
        connected=False,
        message=f"scanning {len(ports)} port(s)",
        candidate_ports=[{"port": p, "description": d} for p, d in ports],
    )

    for port, description in ports:
        for baud in bauds:
            for slave in slaves:
                client: ModbusSerialClient | None = None
                try:
                    client = create_serial_client(port, baud, str(config["parity"]), float(config["detect_timeout_s"]), 0)
                    if not client.connect():
                        continue
                    result = read_holding_registers(client, READ_START, 2, slave)
                    if not result.isError():
                        update_status(
                            "plc",
                            connected=True,
                            port=port,
                            baud=baud,
                            slave_id=slave,
                            message="auto-detect succeeded",
                            description=description,
                        )
                        return {"port": port, "baud": baud, "slave_id": slave}
                except PermissionError as exc:
                    mark_error("plc", f"{port} permission denied: {exc}")
                except Exception as exc:
                    update_status("plc", message=f"scan failed on {port}: {exc}")
                finally:
                    if client is not None:
                        client.close()

    mark_error("plc", "no Modbus RTU response found")
    return None


def open_plc_client(selected: dict[str, Any], config: dict[str, Any]) -> ModbusSerialClient | None:
    try:
        client = create_serial_client(
            selected["port"],
            int(selected["baud"]),
            str(config["parity"]),
            float(config["serial_timeout_s"]),
            int(config["modbus_retries"]),
        )
        if not client.connect():
            mark_error("plc", f"failed to open {selected['port']}")
            return None
        update_status(
            "plc",
            enabled=True,
            connected=True,
            port=selected["port"],
            baud=selected["baud"],
            slave_id=selected["slave_id"],
            message="connected",
        )
        return client
    except Exception as exc:
        mark_error("plc", f"serial open failed: {exc}")
        return None


def read_plc_values(client: ModbusSerialClient, selected: dict[str, Any], config: dict[str, Any]) -> dict[str, Any] | None:
    result = read_holding_registers(client, READ_START, READ_COUNT, int(selected["slave_id"]))
    if result.isError():
        raise RuntimeError(str(result))
    registers = list(result.registers)
    update_status("plc", connected=True, last_ok=utc_ts(), message="poll ok", registers=len(registers))
    return decode_registers(registers, config)


def open_hmi_client(config: dict[str, Any]) -> tuple[ModbusTcpClient, int] | None:
    host = str(config["hmi_host"])
    for port in list(config["hmi_ports"]):
        client: ModbusTcpClient | None = None
        try:
            client = ModbusTcpClient(host, port=int(port), timeout=float(config["hmi_timeout_s"]), retries=int(config["modbus_retries"]))
            if not client.connect():
                client.close()
                continue
            result = read_holding_registers(client, READ_START, 2, int(config["hmi_slave_id"]))
            if not result.isError():
                update_status("hmi", connected=True, host=host, port=port, message="connected")
                return client, int(port)
            client.close()
        except Exception as exc:
            update_status("hmi", message=f"{host}:{port} probe failed: {exc}")
            if client is not None:
                client.close()
    mark_error("hmi", f"no Modbus TCP response from {host} on {list(config['hmi_ports'])}")
    return None


def read_hmi_values(client: ModbusTcpClient, port: int, config: dict[str, Any]) -> dict[str, Any] | None:
    result = read_holding_registers(client, READ_START, READ_COUNT, int(config["hmi_slave_id"]))
    if result.isError():
        raise RuntimeError(str(result))
    registers = list(result.registers)
    update_status(
        "hmi",
        connected=True,
        host=config["hmi_host"],
        port=port,
        last_ok=utc_ts(),
        message="poll ok",
        registers=len(registers),
    )
    return decode_registers(registers, config)


# ---------------------------------------------------------------------------
# Decode, merge, alarms
# ---------------------------------------------------------------------------

def regs_to_float32(r0: int, r1: int, word_order: str) -> float:
    if word_order in {"swap", "le", "little"}:
        r0, r1 = r1, r0
    raw = struct.pack(">HH", r0 & 0xFFFF, r1 & 0xFFFF)
    return round(struct.unpack(">f", raw)[0], 3)


def regs_to_int32(r0: int, r1: int, word_order: str) -> int:
    if word_order in {"swap", "le", "little"}:
        r0, r1 = r1, r0
    raw = struct.pack(">HH", r0 & 0xFFFF, r1 & 0xFFFF)
    return struct.unpack(">i", raw)[0]


def decode_register(regs: list[int], entry: dict[str, Any], config: dict[str, Any]) -> float | int | None:
    address = int(entry["addr"])
    scale = float(entry.get("scale", 1.0))
    try:
        if entry["type"] == "float":
            return regs_to_float32(regs[address], regs[address + 1], str(config["float_word_order"]))
        if entry["type"] == "int32":
            return regs_to_int32(regs[address], regs[address + 1], str(config["int32_word_order"]))
        raw = int(regs[address])
        if raw > 32767:
            raw -= 65536
        return round(raw / scale, 3)
    except (IndexError, struct.error, ValueError):
        return None


def decode_registers(registers: list[int], config: dict[str, Any]) -> dict[str, Any]:
    data: dict[str, Any] = {}
    for entry in REGISTER_MAP:
        name = entry["name"]
        data[name] = normalize_engineering_value(name, decode_register(registers, entry, config))
    return data


def relative_delta(a: float, b: float) -> float:
    return abs(a - b) / max(abs(a), abs(b), 1.0)


def build_mismatches(plc: dict[str, Any] | None, hmi: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not plc or not hmi:
        return []
    mismatches: list[dict[str, Any]] = []
    for entry in REGISTER_MAP:
        name = entry["name"]
        plc_value = plc.get(name)
        hmi_value = hmi.get(name)
        if not is_number(plc_value) or not is_number(hmi_value):
            continue
        delta = relative_delta(float(plc_value), float(hmi_value))
        if delta > MISMATCH_THRESHOLD:
            mismatches.append(
                {
                    "parameter": name,
                    "label": entry["label"],
                    "plc": plc_value,
                    "hmi": hmi_value,
                    "delta_pct": round(delta * 100.0, 2),
                }
            )
    return mismatches


def alarm_state(values: dict[str, Any]) -> list[dict[str, Any]]:
    alarms: list[dict[str, Any]] = []

    motor_temp = values.get("motor_temp")
    if is_number(motor_temp):
        if float(motor_temp) > 85.0:
            alarms.append({"severity": "ALARM", "parameter": "motor_temp", "value": motor_temp, "message": "Motor temp above 85 degC"})
        elif float(motor_temp) > 75.0:
            alarms.append({"severity": "WARNING", "parameter": "motor_temp", "value": motor_temp, "message": "Motor temp above 75 degC"})

    vib_values = [values.get("vib_x"), values.get("vib_y"), values.get("vib_z")]
    if all(is_number(value) for value in vib_values):
        magnitude = math.sqrt(sum(float(value) ** 2 for value in vib_values))
        if magnitude > 1000.0:
            alarms.append({"severity": "ALARM", "parameter": "vib_magnitude", "value": round(magnitude, 2), "message": "Vibration magnitude above 1000 mg"})
        elif magnitude > 500.0:
            alarms.append({"severity": "WARNING", "parameter": "vib_magnitude", "value": round(magnitude, 2), "message": "Vibration magnitude above 500 mg"})

    battery_volt = values.get("battery_volt")
    if is_number(battery_volt) and float(battery_volt) < 22.0:
        alarms.append({"severity": "WARNING", "parameter": "battery_volt", "value": battery_volt, "message": "Battery voltage below 22 V"})

    inverter_volt = values.get("inverter_volt")
    mains_volt = values.get("mains_volt")
    if is_number(inverter_volt) and is_number(mains_volt) and abs(float(mains_volt)) > 1.0:
        deviation = abs(float(inverter_volt) - float(mains_volt)) / abs(float(mains_volt))
        if deviation > 0.10:
            alarms.append({"severity": "ALARM", "parameter": "inverter_volt", "value": inverter_volt, "message": "Inverter voltage deviation above 10 pct"})

    return alarms


def source_values_plausible(values: dict[str, Any] | None) -> bool:
    if not values:
        return False

    battery_volt = values.get("battery_volt")
    inverter_volt = values.get("inverter_volt")
    mains_volt = values.get("mains_volt")
    solar_volt = values.get("solar_volt")
    motor_rpm = values.get("motor_rpm")

    if is_number(battery_volt) and 10.0 <= float(battery_volt) <= 80.0:
        return True
    if is_number(inverter_volt) and float(inverter_volt) >= 80.0:
        return True
    if is_number(mains_volt) and float(mains_volt) >= 80.0:
        return True
    if is_number(solar_volt) and float(solar_volt) >= 10.0:
        return True
    if is_number(motor_rpm) and float(motor_rpm) > 50.0:
        return True
    return False


def load_last_plausible_snapshot(limit: int = 5000) -> dict[str, Any] | None:
    try:
        with sqlite3.connect(DB_PATH) as con:
            rows = con.execute(
                """
                SELECT timestamp, parameter, value
                FROM readings
                ORDER BY timestamp DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
    except Exception:
        return None

    by_ts: dict[str, dict[str, Any]] = {}
    ordered_ts: list[str] = []
    for ts, parameter, value in rows:
        if ts not in by_ts:
            by_ts[ts] = {}
            ordered_ts.append(ts)
        by_ts[ts][parameter] = value

    for ts in ordered_ts:
        snapshot = {name: normalize_engineering_value(name, by_ts[ts].get(name)) for name in PARAM_NAMES}
        if source_values_plausible(snapshot):
            update_status("database", message=f"loaded held snapshot {ts}")
            update_status("plc", last_held_snapshot=ts)
            return snapshot
    return None


def merge_sources(plc: dict[str, Any] | None, hmi: dict[str, Any] | None) -> dict[str, Any]:
    source_by_param: dict[str, str] = {}
    merged: dict[str, Any] = {}
    plc_count = 0
    hmi_count = 0

    for name in PARAM_NAMES:
        plc_value = plc.get(name) if plc else None
        hmi_value = hmi.get(name) if hmi else None
        if plc_value is not None:
            merged[name] = plc_value
            source_by_param[name] = "plc"
            plc_count += 1
        elif hmi_value is not None:
            merged[name] = hmi_value
            source_by_param[name] = "hmi"
            hmi_count += 1
        else:
            merged[name] = None
            source_by_param[name] = "offline"

    if plc_count and hmi_count:
        source = "plc+hmi"
    elif plc_count:
        source = "plc"
    elif hmi_count:
        source = "hmi"
    else:
        source = "offline"

    merged["_ts"] = utc_ts()
    merged["_quality"] = "GOOD" if plc_count or hmi_count else "NO_DATA"
    merged["_source"] = source
    merged["_source_by_param"] = source_by_param
    merged["_mismatches"] = build_mismatches(plc, hmi)
    merged["_alarms"] = alarm_state(merged)
    return merged


def simulated_values(tick: int) -> dict[str, Any]:
    phase = tick / 10.0
    data = {
        "solar_volt": round(65 + math.sin(phase) * 2.5, 2),
        "solar_current": round(8 + math.sin(phase / 2) * 1.2, 2),
        "solar_power": round(520 + math.sin(phase) * 60, 2),
        "mains_volt": round(230 + math.sin(phase / 3) * 3, 2),
        "mains_current": round(4.5 + math.sin(phase / 2) * 0.4, 2),
        "mains_power": round(1035 + math.sin(phase / 2) * 90, 2),
        "battery_volt": round(24.8 + math.sin(phase / 4) * 0.4, 2),
        "battery_current": round(12.2 + math.sin(phase / 2) * 0.8, 2),
        "battery_power": round(302 + math.sin(phase / 2) * 20, 2),
        "inverter_volt": round(229 + math.sin(phase / 2) * 4, 2),
        "inverter_current": round(3.8 + math.sin(phase / 2) * 0.3, 2),
        "inverter_power": round(870 + math.sin(phase / 2) * 70, 2),
        "vfd_current": round(2.4 + math.sin(phase) * 0.2, 2),
        "vfd_volt": round(226 + math.sin(phase) * 2, 2),
        "vfd_power": round(0.54 + math.sin(phase / 2) * 0.05, 2),
        "vib_temp": round(38 + math.sin(phase / 4) * 2, 2),
        "vib_x": int(120 + math.sin(phase) * 20),
        "vib_y": int(90 + math.cos(phase) * 18),
        "vib_z": int(140 + math.sin(phase / 2) * 24),
        "motor_rpm": round(1430 + math.sin(phase / 2) * 40, 1),
        "motor_temp": round(57 + math.sin(phase / 4) * 3, 1),
    }
    data["_ts"] = utc_ts()
    data["_quality"] = "SIMULATED"
    data["_source"] = "simulator"
    data["_source_by_param"] = {name: "simulator" for name in PARAM_NAMES}
    data["_mismatches"] = []
    data["_alarms"] = alarm_state(data)
    return data


# ---------------------------------------------------------------------------
# Persistence and MQTT
# ---------------------------------------------------------------------------

def init_db() -> None:
    try:
        with sqlite3.connect(DB_PATH) as con:
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS readings (
                    timestamp TEXT,
                    parameter TEXT,
                    value REAL
                )
                """
            )
            con.execute("CREATE INDEX IF NOT EXISTS idx_readings_param_ts ON readings(parameter, timestamp)")
        update_status("database", connected=True, last_ok=utc_ts(), message="ready", path=DB_PATH)
    except Exception as exc:
        mark_error("database", f"sqlite init failed: {exc}")


def persist(data: dict[str, Any]) -> None:
    rows = [
        (data["_ts"], key, float(value))
        for key, value in data.items()
        if not key.startswith("_") and is_number(value)
    ]
    if not rows:
        return
    try:
        with sqlite3.connect(DB_PATH) as con:
            con.executemany("INSERT INTO readings(timestamp, parameter, value) VALUES (?, ?, ?)", rows)
        update_status("database", connected=True, last_ok=data["_ts"], message=f"stored {len(rows)} readings")
    except Exception as exc:
        mark_error("database", f"sqlite write failed: {exc}")


def setup_mqtt(config: dict[str, Any]) -> mqtt.Client | None:
    if not bool(config["mqtt_enabled"]):
        update_status("mqtt", enabled=False, connected=False, message="disabled")
        return None

    try:
        try:
            client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="bms_easy302")
        except Exception:
            client = mqtt.Client(client_id="bms_easy302")

        if config["mqtt_username"]:
            client.username_pw_set(str(config["mqtt_username"]), str(config["mqtt_password"]))

        if bool(config["mqtt_tls"]) or int(config["mqtt_port"]) == 8883:
            ca = str(config["mqtt_ca_certs"]) or None
            certfile = str(config["mqtt_certfile"]) or None
            keyfile = str(config["mqtt_keyfile"]) or None
            if ca or certfile or keyfile:
                client.tls_set(ca_certs=ca, certfile=certfile, keyfile=keyfile)
            else:
                client.tls_set()

        def on_connect(_client: mqtt.Client, _userdata: Any, *_args: Any) -> None:
            update_status(
                "mqtt",
                enabled=True,
                connected=True,
                last_ok=utc_ts(),
                host=config["mqtt_host"],
                port=config["mqtt_port"],
                topic=MQTT_TOPIC,
                message="connected",
            )

        def on_disconnect(_client: mqtt.Client, _userdata: Any, *_args: Any) -> None:
            update_status("mqtt", connected=False, message="disconnected")

        client.on_connect = on_connect
        client.on_disconnect = on_disconnect
        client.connect(str(config["mqtt_host"]), int(config["mqtt_port"]), keepalive=60)
        client.loop_start()
        update_status("mqtt", enabled=True, connected=False, message="connecting")
        return client
    except Exception as exc:
        mark_error("mqtt", f"mqtt unavailable: {exc}")
        return None


def publish_mqtt(client: mqtt.Client | None, data: dict[str, Any]) -> None:
    if client is None:
        return
    try:
        client.publish(MQTT_TOPIC, json.dumps(data), qos=1)
    except Exception as exc:
        mark_error("mqtt", f"publish failed: {exc}")


# ---------------------------------------------------------------------------
# Poll loop
# ---------------------------------------------------------------------------

def close_client(client: Any) -> None:
    if client is None:
        return
    try:
        client.close()
    except Exception:
        pass


def poll_loop() -> None:
    global latest_data

    init_db()
    config, generation = get_config()
    mqtt_client = setup_mqtt(config)

    plc_client: ModbusSerialClient | None = None
    plc_selected: dict[str, Any] | None = None
    hmi_client: ModbusTcpClient | None = None
    hmi_port: int | None = None
    last_plc_values = load_last_plausible_snapshot()
    last_hmi_values: dict[str, Any] | None = None
    local_generation = generation
    next_plc_connect = 0.0
    next_hmi_connect = 0.0
    tick = 0

    with STATE_LOCK:
        latest_data = empty_payload("server started")

    while not STOP_EVENT.is_set():
        started = time.time()
        config, generation = get_config()

        if generation != local_generation:
            close_client(plc_client)
            close_client(hmi_client)
            plc_client = None
            plc_selected = None
            hmi_client = None
            hmi_port = None
            local_generation = generation
            next_plc_connect = 0.0
            next_hmi_connect = 0.0
            update_status("plc", connected=False, message="config changed")
            update_status("hmi", connected=False, message="config changed")

        if bool(config["simulate"]):
            data = simulated_values(tick)
            update_status("plc", enabled=False, connected=False, message="simulation mode")
            update_status("hmi", enabled=False, connected=False, message="simulation mode")
        else:
            plc_values: dict[str, Any] | None = None
            hmi_values: dict[str, Any] | None = None
            held_sources: list[str] = []

            if bool(config["plc_enabled"]):
                now = time.time()
                if plc_client is None and now >= next_plc_connect:
                    plc_selected = detect_plc_config(config)
                    if plc_selected:
                        plc_client = open_plc_client(plc_selected, config)
                    if plc_client is None:
                        next_plc_connect = now + float(config["reconnect_s"])

                if plc_client is not None and plc_selected is not None:
                    try:
                        plc_values = read_plc_values(plc_client, plc_selected, config)
                        if source_values_plausible(plc_values):
                            last_plc_values = dict(plc_values)
                        else:
                            mark_bad_frame("plc", "ignored implausible Modbus frame; holding last plausible PLC values")
                            if last_plc_values is not None:
                                plc_values = dict(last_plc_values)
                                held_sources.append("plc")
                            else:
                                plc_values = None
                    except Exception as exc:
                        mark_error("plc", f"poll failed: {exc}")
                        close_client(plc_client)
                        plc_client = None
                        next_plc_connect = time.time() + float(config["reconnect_s"])
            else:
                update_status("plc", enabled=False, connected=False, message="disabled")

            if bool(config["hmi_enabled"]):
                now = time.time()
                if hmi_client is None and now >= next_hmi_connect:
                    opened = open_hmi_client(config)
                    if opened:
                        hmi_client, hmi_port = opened
                    else:
                        next_hmi_connect = now + float(config["reconnect_s"])

                if hmi_client is not None and hmi_port is not None:
                    try:
                        hmi_values = read_hmi_values(hmi_client, hmi_port, config)
                        if source_values_plausible(hmi_values):
                            last_hmi_values = dict(hmi_values)
                        else:
                            mark_bad_frame("hmi", "ignored implausible Modbus TCP frame; holding last plausible HMI values")
                            if last_hmi_values is not None:
                                hmi_values = dict(last_hmi_values)
                                held_sources.append("hmi")
                            else:
                                hmi_values = None
                    except Exception as exc:
                        mark_error("hmi", f"poll failed: {exc}")
                        close_client(hmi_client)
                        hmi_client = None
                        hmi_port = None
                        next_hmi_connect = time.time() + float(config["reconnect_s"])
            else:
                update_status("hmi", enabled=False, connected=False, message="disabled")

            if plc_values is None and bool(config["plc_enabled"]) and last_plc_values is not None:
                plc_values = dict(last_plc_values)
                held_sources.append("plc")

            if hmi_values is None and bool(config["hmi_enabled"]) and last_hmi_values is not None:
                hmi_values = dict(last_hmi_values)
                held_sources.append("hmi")

            data = merge_sources(plc_values, hmi_values)
            if held_sources and data["_quality"] == "GOOD":
                data["_quality"] = "HELD"
                data["_held_sources"] = held_sources
                data["_reason"] = "Holding last plausible values; current PLC/HMI frame is missing or rejected"
            if data["_quality"] == "NO_DATA":
                data["_reason"] = "PLC and HMI are offline or not responding"

        with STATE_LOCK:
            latest_data = data

        if data.get("_quality") != "HELD":
            persist(data)
        publish_mqtt(mqtt_client, data)
        socketio.emit("data", data)

        tick += 1
        elapsed = time.time() - started
        sleep_s = max(0.1, int(config["poll_ms"]) / 1000.0 - elapsed)
        STOP_EVENT.wait(sleep_s)


# ---------------------------------------------------------------------------
# REST API
# ---------------------------------------------------------------------------

@app.get("/api/data")
def api_data() -> Any:
    with STATE_LOCK:
        return jsonify(dict(latest_data or empty_payload()))


@app.get("/api/data/<param>")
def api_param(param: str) -> Any:
    if param not in PARAM_NAMES:
        return jsonify({"error": "unknown parameter", "parameter": param}), 404
    with STATE_LOCK:
        data = dict(latest_data or empty_payload())
    return jsonify({param: data.get(param), "_ts": data.get("_ts"), "_source": data.get("_source_by_param", {}).get(param)})


@app.get("/api/history")
def api_history() -> Any:
    param = request.args.get("param", "motor_rpm")
    if param not in PARAM_NAMES:
        return jsonify({"error": "unknown parameter", "parameter": param}), 404
    try:
        n = max(1, min(5000, int(request.args.get("n", "100"))))
    except ValueError:
        n = 100
    try:
        with sqlite3.connect(DB_PATH) as con:
            rows = con.execute(
                "SELECT timestamp, value FROM readings WHERE parameter=? ORDER BY timestamp DESC LIMIT ?",
                (param, n),
            ).fetchall()
        return jsonify([{"ts": row[0], "value": row[1]} for row in reversed(rows)])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.get("/api/status")
def api_status() -> Any:
    config, generation = get_config()
    with STATE_LOCK:
        statuses = json.loads(json.dumps(source_status))
    return jsonify(
        {
            "config": safe_config(config),
            "generation": generation,
            "status": statuses,
            "register_count": len(REGISTER_MAP),
            "db_path": DB_PATH,
            "mqtt_topic": MQTT_TOPIC,
        }
    )


@app.get("/api/register_map")
def api_register_map() -> Any:
    return jsonify(register_map_payload())


@app.route("/api/config", methods=["GET", "POST"])
def api_config() -> Any:
    global CONFIG_GENERATION

    if request.method == "GET":
        config, generation = get_config()
        return jsonify({"config": safe_config(config), "generation": generation})

    payload = request.get_json(silent=True) or {}
    aliases = {
        "COM_PORT": "com_port",
        "com_port": "com_port",
        "BAUD": "baud_rate",
        "BAUD_RATE": "baud_rate",
        "baud_rate": "baud_rate",
        "SLAVE_ID": "slave_id",
        "slave_id": "slave_id",
        "PARITY": "parity",
        "parity": "parity",
        "POLL_MS": "poll_ms",
        "poll_ms": "poll_ms",
        "PLC_ENABLED": "plc_enabled",
        "plc_enabled": "plc_enabled",
        "HMI_ENABLED": "hmi_enabled",
        "hmi_enabled": "hmi_enabled",
        "MQTT_ENABLED": "mqtt_enabled",
        "mqtt_enabled": "mqtt_enabled",
        "SIMULATE": "simulate",
        "simulate": "simulate",
        "HMI_HOST": "hmi_host",
        "hmi_host": "hmi_host",
        "HMI_PORTS": "hmi_ports",
        "hmi_ports": "hmi_ports",
        "HMI_SLAVE_ID": "hmi_slave_id",
        "hmi_slave_id": "hmi_slave_id",
        "FLOAT_WORD_ORDER": "float_word_order",
        "float_word_order": "float_word_order",
    }
    numeric_keys = {"baud_rate", "slave_id", "poll_ms", "hmi_slave_id"}
    boolean_keys = {"plc_enabled", "hmi_enabled", "mqtt_enabled", "simulate"}
    changed: dict[str, Any] = {}

    with CONFIG_LOCK:
        for raw_key, value in payload.items():
            key = aliases.get(raw_key)
            if not key:
                continue
            if key == "hmi_ports":
                parsed = parse_int_list(",".join(str(v) for v in value) if isinstance(value, list) else str(value), [502, 5000])
                RUNTIME_CONFIG[key] = parsed
                changed[key] = parsed
            elif key in boolean_keys:
                if isinstance(value, bool):
                    parsed_bool = value
                else:
                    parsed_bool = str(value).strip().lower() in {"1", "true", "yes", "on"}
                RUNTIME_CONFIG[key] = parsed_bool
                changed[key] = parsed_bool
            elif key in numeric_keys:
                try:
                    RUNTIME_CONFIG[key] = int(value)
                    changed[key] = int(value)
                except (TypeError, ValueError):
                    continue
            elif key == "parity":
                RUNTIME_CONFIG[key] = str(value).upper()[:1] or "N"
                changed[key] = RUNTIME_CONFIG[key]
            else:
                RUNTIME_CONFIG[key] = str(value)
                changed[key] = str(value)

        if changed:
            CONFIG_GENERATION += 1

        return jsonify({"changed": changed, "config": safe_config(RUNTIME_CONFIG), "generation": CONFIG_GENERATION})


# ---------------------------------------------------------------------------
# Dashboard pages
# ---------------------------------------------------------------------------

DASHBOARD_HTML = r"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>BMS Live - EASY302</title>
  <style>
    :root {
      color-scheme: light;
      --paper: #f7f8f5;
      --sheet: #ffffff;
      --ink: #111512;
      --muted: #66706a;
      --line: #d8ded6;
      --line-strong: #111512;
      --pine: #24453b;
      --glacier: #b9d4d7;
      --ice: #e7f0ef;
      --signal: #ff6b4a;
      --amber: #b87919;
      --bad: #b1332a;
      --held: #8b6f1c;
      --shadow: 0 18px 50px rgba(28, 38, 32, .08);
    }
    * { box-sizing: border-box; }
    html { background: var(--paper); }
    body {
      margin: 0;
      color: var(--ink);
      background:
        linear-gradient(90deg, rgba(17, 21, 18, .045) 1px, transparent 1px) 0 0 / 32px 32px,
        linear-gradient(0deg, rgba(17, 21, 18, .035) 1px, transparent 1px) 0 0 / 32px 32px,
        var(--paper);
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-variant-numeric: tabular-nums;
    }
    a { color: inherit; }
    .page { max-width: 1600px; margin: 0 auto; padding: 18px; }
    .mast {
      min-height: 118px;
      display: grid;
      grid-template-columns: minmax(260px, 1.4fr) minmax(300px, .9fr);
      gap: 18px;
      margin-bottom: 18px;
    }
    .brand {
      position: relative;
      overflow: hidden;
      min-height: 118px;
      border: 1px solid var(--line-strong);
      background: var(--sheet);
      box-shadow: var(--shadow);
      padding: 18px;
      display: grid;
      grid-template-columns: minmax(220px, .72fr) minmax(190px, .28fr);
      gap: 18px;
    }
    .kicker {
      margin: 0 0 10px;
      font-size: 11px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: .18em;
      font-weight: 700;
    }
    h1 {
      margin: 0;
      max-width: 720px;
      font-size: clamp(34px, 4vw, 68px);
      line-height: .92;
      letter-spacing: 0;
      font-weight: 800;
    }
    .subline {
      margin: 12px 0 0;
      max-width: 720px;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.45;
    }
    .poly {
      min-height: 150px;
      position: relative;
      border-left: 1px solid var(--line);
      isolation: isolate;
    }
    .poly span { position: absolute; display: block; clip-path: polygon(50% 0, 100% 100%, 0 100%); }
    .p1 { width: 150px; height: 130px; right: 10px; top: 0; background: var(--pine); transform: rotate(18deg); }
    .p2 { width: 120px; height: 110px; right: 76px; top: 35px; background: var(--glacier); transform: rotate(-28deg); mix-blend-mode: multiply; }
    .p3 { width: 95px; height: 85px; right: 4px; top: 76px; background: #dce9e6; transform: rotate(49deg); }
    .p4 { width: 70px; height: 62px; right: 118px; top: 5px; background: var(--signal); transform: rotate(78deg); opacity: .86; }
    .audit {
      border: 1px solid var(--line-strong);
      background: var(--ink);
      color: #f4f6f1;
      padding: 16px;
      display: grid;
      grid-template-rows: auto 1fr auto;
      gap: 12px;
    }
    .audit-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
      border-bottom: 1px solid rgba(255,255,255,.22);
      padding-bottom: 12px;
    }
    .audit-title { margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: .16em; }
    .state-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--bad); border: 1px solid #f4f6f1; }
    .state-dot.good { background: #64b98a; }
    .state-dot.held { background: #d7b447; }
    .audit-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; }
    .audit-item { min-width: 0; }
    .audit-label {
      display: block;
      margin-bottom: 3px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: .14em;
      color: rgba(244,246,241,.62);
    }
    .audit-value {
      display: block;
      font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .audit-links { display: flex; gap: 8px; flex-wrap: wrap; }
    .audit-links a {
      border: 1px solid rgba(255,255,255,.28);
      border-radius: 4px;
      color: #f4f6f1;
      padding: 7px 9px;
      text-decoration: none;
      font-size: 12px;
    }
    .status-strip {
      display: grid;
      grid-template-columns: repeat(4, minmax(150px, 1fr));
      gap: 10px;
      margin-bottom: 18px;
    }
    .strip-cell {
      min-height: 76px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,.68);
      padding: 12px;
    }
    .strip-label {
      margin: 0 0 8px;
      color: var(--muted);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: .14em;
      font-weight: 700;
    }
    .strip-value { margin: 0; font-size: 18px; font-weight: 750; }
    .alerts {
      margin-bottom: 18px;
      border: 1px solid var(--line);
      background: var(--sheet);
      padding: 12px 14px;
      color: var(--muted);
      font-size: 13px;
    }
    .alerts strong { color: var(--bad); }
    .section {
      display: grid;
      grid-template-columns: 180px 1fr;
      gap: 16px;
      border-top: 1px solid var(--line-strong);
      padding-top: 16px;
      margin-bottom: 24px;
    }
    .section-title {
      position: sticky;
      top: 18px;
      align-self: start;
      margin: 0;
      font-size: 13px;
      letter-spacing: .12em;
      text-transform: uppercase;
      font-weight: 800;
    }
    .section-title span {
      display: block;
      margin-top: 8px;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.35;
      letter-spacing: 0;
      text-transform: none;
      font-weight: 500;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 10px;
    }
    .metric {
      min-height: 152px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: rgba(255,255,255,.82);
      padding: 12px;
      display: grid;
      grid-template-rows: auto auto 36px auto;
      gap: 8px;
      box-shadow: 0 1px 0 rgba(17,21,18,.04);
    }
    .metric.alarm { border-color: var(--bad); box-shadow: inset 4px 0 0 var(--bad); }
    .metric-head { display: flex; justify-content: space-between; gap: 8px; align-items: start; }
    .label {
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .1em;
      font-weight: 760;
      line-height: 1.25;
    }
    .badge {
      flex: none;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 3px 7px;
      color: var(--pine);
      background: var(--ice);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: .08em;
      font-weight: 760;
    }
    .badge.offline { color: var(--muted); background: transparent; }
    .badge.held { color: var(--held); background: #f8f2d6; border-color: #d7c36a; }
    .value-row { white-space: nowrap; }
    .value {
      font-size: clamp(30px, 4vw, 46px);
      line-height: .9;
      font-weight: 760;
      letter-spacing: 0;
    }
    .unit { color: var(--muted); font-size: 13px; margin-left: 4px; }
    .null { color: #a0aaa3; }
    canvas { width: 100%; height: 36px; display: block; }
    .meta-line {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      color: var(--muted);
      font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
      font-size: 11px;
      border-top: 1px solid var(--line);
      padding-top: 8px;
    }
    .quality-good { color: var(--pine); }
    .quality-held { color: var(--held); }
    .quality-bad { color: var(--bad); }
    @media (max-width: 980px) {
      .mast, .section { grid-template-columns: 1fr; }
      .poly { min-height: 92px; border-left: 0; border-top: 1px solid var(--line); }
      .status-strip { grid-template-columns: 1fr 1fr; }
      .section-title { position: static; }
    }
    @media (max-width: 620px) {
      .page { padding: 10px; }
      .brand { grid-template-columns: 1fr; }
      .status-strip, .audit-grid { grid-template-columns: 1fr; }
      .grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="mast">
      <section class="brand" aria-labelledby="title">
        <div>
          <p class="kicker">Cladbit BMS monitor / EASY302</p>
          <h1 id="title">Measured power, without drama.</h1>
          <p class="subline" id="statusline">Starting acquisition...</p>
        </div>
        <div class="poly" aria-hidden="true">
          <span class="p1"></span><span class="p2"></span><span class="p3"></span><span class="p4"></span>
        </div>
      </section>
      <aside class="audit" aria-label="Data provenance">
        <div class="audit-head">
          <p class="audit-title">Source audit</p>
          <span class="state-dot" id="state-dot"></span>
        </div>
        <div class="audit-grid">
          <div class="audit-item"><span class="audit-label">Quality</span><span class="audit-value" id="quality-pill">NO_DATA</span></div>
          <div class="audit-item"><span class="audit-label">Primary path</span><span class="audit-value" id="source-pill">offline</span></div>
          <div class="audit-item"><span class="audit-label">PLC link</span><span class="audit-value" id="plc-link">--</span></div>
          <div class="audit-item"><span class="audit-label">Read contract</span><span class="audit-value" id="read-contract">FC03 holding 0..39</span></div>
          <div class="audit-item"><span class="audit-label">Float order</span><span class="audit-value" id="float-order">swap</span></div>
          <div class="audit-item"><span class="audit-label">Last good PLC</span><span class="audit-value" id="last-good">--</span></div>
        </div>
        <nav class="audit-links" aria-label="Diagnostics">
          <a href="/api/data">Live JSON</a>
          <a href="/api/status">Status</a>
          <a href="/api/register_map">Register map</a>
          <a href="/chart">History</a>
        </nav>
      </aside>
    </header>

    <section class="status-strip" aria-label="System summary">
      <div class="strip-cell"><p class="strip-label">Battery</p><p class="strip-value" id="summary-battery">--</p></div>
      <div class="strip-cell"><p class="strip-label">Inverter</p><p class="strip-value" id="summary-inverter">--</p></div>
      <div class="strip-cell"><p class="strip-label">Motor</p><p class="strip-value" id="summary-motor">--</p></div>
      <div class="strip-cell"><p class="strip-label">Frame stability</p><p class="strip-value" id="summary-stability">--</p></div>
    </section>

    <div class="alerts" id="alarms">No active alarms.</div>
    <div id="sections"></div>
  </main>

  <script>
    const META = __REGISTER_META__;
    const GROUPS = __GROUPS__;
    const metaByName = Object.fromEntries(META.map((m) => [m.name, m]));
    const historyByName = Object.fromEntries(META.map((m) => [m.name, []]));
    const lastTsByName = {};
    const sections = document.getElementById("sections");
    const groupNotes = {
      Solar: "PV meter registers 0-5",
      Mains: "AC input registers 6-11",
      Battery: "24 V bank registers 12-17",
      Inverter: "Output registers 18-22",
      VFD: "Drive integers 23-25",
      Vibration: "Sensor integers 27-34",
      Motor: "RPM and temperature registers 36-38"
    };

    function renderShell() {
      sections.innerHTML = Object.entries(GROUPS).map(([group, names]) => `
        <section class="section">
          <h2 class="section-title">${group}<span>${groupNotes[group] || "PLC holding registers"}</span></h2>
          <div class="grid">
            ${names.map((name) => {
              const meta = metaByName[name];
              const widthEnd = Number(meta.addr) + Number(meta.width) - 1;
              return `<article class="metric" id="card-${name}">
                <div class="metric-head">
                  <div class="label">${meta.label}</div>
                  <span class="badge offline" id="source-${name}">offline</span>
                </div>
                <div class="value-row"><span class="value" id="value-${name}"><span class="null">--</span></span><span class="unit">${meta.unit}</span></div>
                <canvas id="spark-${name}" width="260" height="36" aria-label="${meta.label} trend"></canvas>
                <div class="meta-line"><span>addr ${meta.addr}${meta.width > 1 ? "-" + widthEnd : ""}</span><span>${meta.type}</span></div>
              </article>`;
            }).join("")}
          </div>
        </section>
      `).join("");
    }

    function numeric(value) {
      return value !== null && value !== undefined && !Number.isNaN(Number(value));
    }

    function fmtFor(name, value) {
      if (!numeric(value)) return '<span class="null">--</span>';
      const precision = Number(metaByName[name]?.precision ?? 3);
      return Number(value).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: precision
      });
    }

    function plainFor(name, value) {
      if (!numeric(value)) return "--";
      const precision = Number(metaByName[name]?.precision ?? 3);
      return Number(value).toLocaleString(undefined, { maximumFractionDigits: precision });
    }

    function drawSpark(name) {
      const canvas = document.getElementById(`spark-${name}`);
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const values = historyByName[name].filter(numeric).map(Number);
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = "#d8ded6";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h - 2);
      ctx.lineTo(w, h - 2);
      ctx.stroke();
      if (values.length < 2) return;
      const min = Math.min(...values);
      const max = Math.max(...values);
      const span = Math.max(max - min, 0.0001);
      ctx.strokeStyle = "#24453b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      values.forEach((value, index) => {
        const x = (index / (values.length - 1)) * w;
        const y = h - 4 - ((value - min) / span) * (h - 9);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    function updateSpark(name, value, data) {
      if (!numeric(value) || data._quality === "HELD") return;
      if (lastTsByName[name] === data._ts) return;
      lastTsByName[name] = data._ts;
      const values = historyByName[name];
      values.push(Number(value));
      if (values.length > 60) values.shift();
      drawSpark(name);
    }

    function alarmFor(name, data) {
      if (name === "motor_temp" && Number(data.motor_temp) > 80) return true;
      if (["vib_x", "vib_y", "vib_z", "vib_temp"].includes(name)) {
        const x = Number(data.vib_x || 0);
        const y = Number(data.vib_y || 0);
        const z = Number(data.vib_z || 0);
        return Math.sqrt(x * x + y * y + z * z) > 500;
      }
      return false;
    }

    function renderAlarms(data) {
      const alarms = data._alarms || [];
      const mismatches = data._mismatches || [];
      if (!alarms.length && !mismatches.length) {
        document.getElementById("alarms").textContent = data._reason || "No active alarms.";
        return;
      }
      document.getElementById("alarms").innerHTML = [
        ...alarms.map((a) => `<strong>${a.severity}</strong> ${a.message} (${a.value})`),
        ...mismatches.map((m) => `<strong>MISMATCH</strong> ${m.label}: PLC ${m.plc}, HMI ${m.hmi}, ${m.delta_pct}%`)
      ].join("<br>");
    }

    function applyStatus(status) {
      const cfg = status.config || {};
      const plc = (status.status || {}).plc || {};
      const hmi = (status.status || {}).hmi || {};
      document.getElementById("plc-link").textContent = `${plc.port || cfg.com_port || "--"} / ${plc.baud || cfg.baud_rate || "--"} / slave ${plc.slave_id || cfg.slave_id || "--"}`;
      document.getElementById("read-contract").textContent = `FC03 holding 0-39, ${status.register_count || 21} tags`;
      document.getElementById("float-order").textContent = `${cfg.float_word_order || "swap"} / HMI ${hmi.enabled ? "enabled" : "disabled"}`;
      document.getElementById("last-good").textContent = plc.last_ok || plc.last_held_snapshot || "--";
      document.getElementById("summary-stability").textContent = `${plc.errors || 0} errors / ${plc.bad_frames || 0} rejected`;
    }

    function applyData(data) {
      const quality = data._quality || "NO_DATA";
      const source = data._source || "offline";
      const held = quality === "HELD";
      document.getElementById("statusline").textContent = `${data._ts || "--"} - ${data._reason || "live PLC frame accepted"}`;
      document.getElementById("quality-pill").textContent = quality;
      document.getElementById("source-pill").textContent = source;
      const dot = document.getElementById("state-dot");
      dot.className = `state-dot ${quality === "GOOD" || quality === "SIMULATED" ? "good" : held ? "held" : ""}`;
      document.getElementById("quality-pill").className = `audit-value ${quality === "GOOD" ? "quality-good" : held ? "quality-held" : "quality-bad"}`;

      document.getElementById("summary-battery").textContent = `${plainFor("battery_volt", data.battery_volt)} V / ${plainFor("battery_current", data.battery_current)} A`;
      document.getElementById("summary-inverter").textContent = `${plainFor("inverter_volt", data.inverter_volt)} V`;
      document.getElementById("summary-motor").textContent = `${plainFor("motor_rpm", data.motor_rpm)} RPM`;

      for (const meta of META) {
        const name = meta.name;
        const value = data[name];
        const sourceName = (data._source_by_param || {})[name] || "offline";
        document.getElementById(`value-${name}`).innerHTML = fmtFor(name, value);
        const badge = document.getElementById(`source-${name}`);
        badge.textContent = held && sourceName !== "offline" ? "held" : sourceName;
        badge.className = `badge ${sourceName === "offline" ? "offline" : held ? "held" : ""}`;
        document.getElementById(`card-${name}`).classList.toggle("alarm", alarmFor(name, data));
        updateSpark(name, value, data);
      }
      renderAlarms(data);
    }

    async function pollData() {
      try {
        const response = await fetch("/api/data", { cache: "no-store" });
        applyData(await response.json());
      } catch {
        document.getElementById("statusline").textContent = "API connection lost";
      }
    }

    async function pollStatus() {
      try {
        const response = await fetch("/api/status", { cache: "no-store" });
        applyStatus(await response.json());
      } catch {
        document.getElementById("summary-stability").textContent = "status offline";
      }
    }

    renderShell();
    pollData();
    pollStatus();
    setInterval(pollData, 1000);
    setInterval(pollStatus, 5000);
  </script>
</body>
</html>
"""


CHART_HTML = r"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>BMS History - EASY302</title>
  <style>
    :root {
      color-scheme: light;
      --paper: #f7f8f5;
      --sheet: #ffffff;
      --ink: #111512;
      --muted: #66706a;
      --line: #d8ded6;
      --pine: #24453b;
      --signal: #ff6b4a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background:
        linear-gradient(90deg, rgba(17,21,18,.045) 1px, transparent 1px) 0 0 / 32px 32px,
        linear-gradient(0deg, rgba(17,21,18,.035) 1px, transparent 1px) 0 0 / 32px 32px,
        var(--paper);
      color: var(--ink);
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-variant-numeric: tabular-nums;
    }
    .page { max-width: 1180px; margin: 0 auto; padding: 18px; }
    header {
      border: 1px solid var(--ink);
      background: var(--sheet);
      padding: 18px;
      display: flex;
      justify-content: space-between;
      gap: 14px;
      align-items: end;
      margin-bottom: 18px;
    }
    .kicker { margin: 0 0 8px; color: var(--muted); font-size: 11px; letter-spacing: .16em; text-transform: uppercase; font-weight: 750; }
    h1 { margin: 0; font-size: clamp(32px, 5vw, 64px); line-height: .95; }
    a { color: var(--ink); text-decoration: none; border-bottom: 1px solid var(--ink); }
    .controls {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) 120px auto minmax(180px, 1fr);
      gap: 10px;
      align-items: center;
      margin-bottom: 12px;
    }
    select, input, button {
      height: 42px;
      background: var(--sheet);
      color: var(--ink);
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 0 10px;
      font: inherit;
    }
    button { border-color: var(--ink); cursor: pointer; font-weight: 750; }
    .muted { color: var(--muted); font-size: 13px; }
    .panel {
      height: 560px;
      border: 1px solid var(--ink);
      background: var(--sheet);
      padding: 14px;
    }
    canvas { width: 100%; height: 100%; display: block; }
    @media (max-width: 760px) {
      header { align-items: start; flex-direction: column; }
      .controls { grid-template-columns: 1fr; }
      .panel { height: 420px; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header>
      <div>
        <p class="kicker">Historical trace</p>
        <h1>One signal, one line.</h1>
      </div>
      <a href="/">Dashboard</a>
    </header>
    <div class="controls">
      <select id="param"></select>
      <input id="n" type="number" min="1" max="5000" value="300">
      <button id="load">Load trace</button>
      <span class="muted" id="status">Waiting for data...</span>
    </div>
    <div class="panel">
      <canvas id="chart" width="1100" height="520" aria-label="Historical chart"></canvas>
    </div>
  </main>
  <script>
    const META = __REGISTER_META__;
    const select = document.getElementById("param");
    const n = document.getElementById("n");
    const status = document.getElementById("status");
    const canvas = document.getElementById("chart");
    const ctx = canvas.getContext("2d");
    select.innerHTML = META.map((m) => `<option value="${m.name}">${m.label} (${m.unit})</option>`).join("");
    select.value = "battery_volt";

    function draw(rows, meta) {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#d8ded6";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 8; i++) {
        const y = 40 + i * ((h - 80) / 8);
        ctx.beginPath();
        ctx.moveTo(55, y);
        ctx.lineTo(w - 24, y);
        ctx.stroke();
      }
      ctx.fillStyle = "#111512";
      ctx.font = "700 18px Helvetica, Arial, sans-serif";
      ctx.fillText(`${meta.label} (${meta.unit})`, 55, 28);
      if (rows.length < 2) return;
      const values = rows.map((row) => Number(row.value)).filter((value) => Number.isFinite(value));
      const min = Math.min(...values);
      const max = Math.max(...values);
      const span = Math.max(max - min, 0.0001);
      ctx.fillStyle = "#66706a";
      ctx.font = "12px Helvetica, Arial, sans-serif";
      ctx.fillText(max.toFixed(meta.precision || 1), 8, 46);
      ctx.fillText(min.toFixed(meta.precision || 1), 8, h - 35);
      ctx.strokeStyle = "#24453b";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      rows.forEach((row, index) => {
        const x = 55 + (index / (rows.length - 1)) * (w - 79);
        const y = h - 40 - ((Number(row.value) - min) / span) * (h - 88);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.fillStyle = "#ff6b4a";
      const last = rows[rows.length - 1];
      const lx = w - 24;
      const ly = h - 40 - ((Number(last.value) - min) / span) * (h - 88);
      ctx.beginPath();
      ctx.arc(lx, ly, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    async function loadHistory() {
      const param = select.value;
      const response = await fetch(`/api/history?param=${encodeURIComponent(param)}&n=${encodeURIComponent(n.value)}`, { cache: "no-store" });
      const rows = await response.json();
      if (!Array.isArray(rows)) {
        status.textContent = rows.error || "History unavailable";
        return;
      }
      const meta = META.find((m) => m.name === param);
      status.textContent = `${rows.length} reading(s), oldest ${rows[0]?.ts || "--"}, newest ${rows[rows.length - 1]?.ts || "--"}`;
      draw(rows, meta);
    }
    document.getElementById("load").addEventListener("click", loadHistory);
    loadHistory();
  </script>
</body>
</html>
"""


@app.get("/")
def dashboard() -> Any:
    html = DASHBOARD_HTML.replace("__REGISTER_META__", json.dumps(register_map_payload()))
    html = html.replace("__GROUPS__", json.dumps(REGISTER_GROUPS))
    return html, 200, {"Content-Type": "text/html; charset=utf-8"}


@app.get("/chart")
def chart() -> Any:
    html = CHART_HTML.replace("__REGISTER_META__", json.dumps(register_map_payload()))
    return html, 200, {"Content-Type": "text/html; charset=utf-8"}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    config, _generation = get_config()
    with STATE_LOCK:
        source_status["plc"]["enabled"] = bool(config["plc_enabled"])
        source_status["hmi"]["enabled"] = bool(config["hmi_enabled"])
        source_status["mqtt"]["enabled"] = bool(config["mqtt_enabled"])

    log.info("=" * 60)
    log.info("BMS Server starting")
    log.info("Dashboard: http://localhost:%s", env_int("BMS_WEB_PORT", 5000))
    log.info("JSON API : http://localhost:%s/api/data", env_int("BMS_WEB_PORT", 5000))
    log.info("PLC     : port=%s baud=%s slave=%s", config["com_port"], config["baud_rate"], config["slave_id"])
    log.info("HMI     : %s ports=%s", config["hmi_host"], config["hmi_ports"])
    log.info("MQTT    : enabled=%s host=%s port=%s topic=%s", config["mqtt_enabled"], config["mqtt_host"], config["mqtt_port"], MQTT_TOPIC)
    log.info("=" * 60)

    thread = threading.Thread(target=poll_loop, daemon=True)
    thread.start()

    socketio.run(
        app,
        host=os.getenv("BMS_WEB_HOST", "0.0.0.0"),
        port=env_int("BMS_WEB_PORT", 5000),
        debug=False,
        allow_unsafe_werkzeug=True,
    )


if __name__ == "__main__":
    main()
