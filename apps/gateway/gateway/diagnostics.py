"""Gateway diagnostics for COM ports and ingest path."""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import httpx
import serial
from serial.tools import list_ports

from gateway.raw_serial_reader import build_line_tag_index, parse_line_to_frames
from gateway.settings import Settings, config_path, resolve_tag_map_path
from gateway.transport.discovery import (
    DiscoveryError,
    enumerate_ports,
    friendly_name,
    is_raw_port_name,
    resolve,
    stable_selector,
    suggested_mode,
)
from gateway.transport.serial_link import is_port_held


@dataclass(frozen=True, slots=True)
class PortProbe:
    port: str
    available: bool
    detail: str


def list_serial_ports() -> list[dict[str, Any]]:
    """Enumerate ports with VID/PID, serial number, by-id path, known-adapter name and the stable
    selector the setup wizard would save for each one."""
    hwids = {p.device: p.hwid for p in list_ports.comports()}
    idents = enumerate_ports()
    rows: list[dict[str, Any]] = []
    for ident in idents:
        row = ident.as_dict()
        row["hwid"] = hwids.get(ident.device, "")
        row["held_by_gateway"] = is_port_held(ident.device)
        stable = stable_selector(ident, idents)
        row["friendly_name"] = friendly_name(ident)
        row["stable_selector"] = stable.selector
        row["stable_selector_warning"] = stable.warning
        row["suggested_mode"] = suggested_mode(ident)
        rows.append(row)
    return rows


def config_report(settings: Settings) -> dict[str, Any]:
    """Which machine config file applies and whether the active selector is a fragile raw name."""
    path = config_path()
    selector = settings.link_selector()
    report: dict[str, Any] = {"path": str(path), "exists": path.is_file(), "selector": selector or "auto"}
    if is_raw_port_name(selector):
        report["warning"] = (
            f"selector {selector!r} is a raw port name that can change across reboots/PCs; run "
            "`python -m gateway.setup_wizard` to save a stable one (sn:SERIAL or VID:PID)"
        )
    return report


def detect_port(selector: str | None) -> dict[str, Any]:
    """Resolve *selector* exactly like the gateway link does (never guesses)."""
    try:
        return {"ok": True, "selector": selector or "auto", "port": resolve(selector).as_dict()}
    except DiscoveryError as exc:
        return {
            "ok": False,
            "selector": selector or "auto",
            "error": str(exc),
            "candidates": [c.as_dict() for c in exc.candidates],
        }


def probe_port(port: str, *, baudrate: int) -> PortProbe:
    """Open/close test. Refuses ports held by a live gateway link; opens exclusively on POSIX.

    The probe opens with DTR/RTS low so it does not auto-reset an attached Arduino.
    """
    owner = is_port_held(port)
    if owner is not None:
        return PortProbe(port=port, available=False, detail=f"held_by_gateway_link:{owner}")
    try:
        ser = serial.Serial()
        ser.port = port
        ser.baudrate = baudrate
        ser.timeout = 0
        ser.dtr = False
        ser.rts = False
        if os.name == "posix":
            ser.exclusive = True
        ser.open()
        ser.close()
        return PortProbe(port=port, available=True, detail="open_ok")
    except Exception as exc:
        return PortProbe(port=port, available=False, detail=f"{type(exc).__name__}: {exc}")


def api_health(api_base: str) -> dict[str, Any]:
    try:
        response = httpx.get(f"{api_base.rstrip('/')}/healthz", timeout=5.0)
        return {"ok": response.is_success, "status_code": response.status_code, "body": response.text}
    except Exception as exc:
        return {"ok": False, "status_code": None, "body": f"{type(exc).__name__}: {exc}"}


def parse_line(
    *,
    line: str,
    gateway_id: str,
    default_tag_id: str | None,
    tag_map_path: Path,
) -> dict[str, Any]:
    tag_map = json.loads(tag_map_path.read_text(encoding="utf-8"))
    frames = parse_line_to_frames(
        line,
        tag_index=build_line_tag_index(tag_map),
        default_tag_id=default_tag_id,
        gateway_id=gateway_id,
        first_seq=900000,
    )
    return {
        "ok": bool(frames),
        "frames": len(frames),
        "parsed": [frame.to_contract() for frame in frames],
        "decoder": _parse_line_details(line, default_tag_id=default_tag_id, tag_map_path=tag_map_path),
        "error": "" if frames else "line produced no TagFrames",
    }


def _parse_line_details(line: str, *, default_tag_id: str | None, tag_map_path: Path) -> dict[str, Any]:
    from gateway.line.protocols import LineDecoder

    tag_map = json.loads(tag_map_path.read_text(encoding="utf-8"))
    decoder = LineDecoder(build_line_tag_index(tag_map), default_tag_id=default_tag_id)
    decoder.decode(line)
    return decoder.stats.as_dict()


def post_line_to_api(
    *,
    line: str,
    api_base: str,
    token: str,
    gateway_id: str,
    default_tag_id: str | None,
    tag_map_path: Path,
) -> dict[str, Any]:
    parsed = parse_line(
        line=line,
        gateway_id=gateway_id,
        default_tag_id=default_tag_id,
        tag_map_path=tag_map_path,
    )
    frames = parsed["parsed"]
    if not frames:
        return {"ok": False, "frames": 0, "responses": [], "error": parsed["error"]}
    responses = []
    ok = True
    with httpx.Client(timeout=10.0) as client:
        for frame in frames:
            response = client.post(
                f"{api_base.rstrip('/')}/api/ingest/frame",
                headers={"Authorization": f"Bearer {token}"},
                json=frame,
            )  # explicit, test-only path (--post); the gateway itself uses publish.uplink
            responses.append({"status_code": response.status_code, "body": response.text})
            ok = ok and response.is_success
    return {"ok": ok, "frames": len(frames), "responses": responses, "posted": True}


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect PlantLens gateway COM/API status.")
    parser.add_argument("--port", default=None, help="Port to probe (default: auto-detected port, if unique).")
    parser.add_argument(
        "--detect",
        default=None,
        metavar="SELECTOR",
        help="Resolve a link selector (auto | VID:PID[:SERIAL] | sn:SERIAL | path) like the gateway does.",
    )
    parser.add_argument("--baudrate", type=int, default=9600, help="Serial baudrate for open probe.")
    parser.add_argument("--api-base", default=None, help="PlantLens API base URL (default: API_BASE_URL / saved config).")
    parser.add_argument("--token", default=None, help="Gateway ingest token (default: GATEWAY_INGEST_TOKEN / saved config).")
    parser.add_argument("--line", default="", help="Optional raw serial line to parse. Does not post by default.")
    parser.add_argument("--post", action="store_true", help="POST --line frames to API ingest. Intended for explicit test-only use.")
    parser.add_argument("--default-tag-id", default="MOTOR_301_CURRENT", help="Tag for bare numeric lines.")
    parser.add_argument("--gateway-id", default="gw-rs485-1", help="Gateway id for emitted test frames.")
    args = parser.parse_args()

    settings = Settings()
    args.api_base = args.api_base or settings.api_base_url
    args.token = args.token or settings.gateway_ingest_token
    tag_map_path = resolve_tag_map_path(settings)
    detection = detect_port(args.detect if args.detect is not None else settings.link_selector())
    port = args.port or (detection["port"]["device"] if detection["ok"] else None)
    result: dict[str, Any] = {
        "ports": list_serial_ports(),
        "detect": detection,
        "probe": asdict(probe_port(port, baudrate=args.baudrate)) if port else None,
        "api": api_health(args.api_base),
        "config": config_report(settings),
        "tag_map_path": str(tag_map_path),
    }
    if args.line:
        if args.post:
            result["line_ingest"] = post_line_to_api(
                line=args.line,
                api_base=args.api_base,
                token=args.token,
                gateway_id=args.gateway_id,
                default_tag_id=args.default_tag_id,
                tag_map_path=tag_map_path,
            )
        else:
            result["line_parse"] = parse_line(
                line=args.line,
                gateway_id=args.gateway_id,
                default_tag_id=args.default_tag_id,
                tag_map_path=tag_map_path,
            )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
