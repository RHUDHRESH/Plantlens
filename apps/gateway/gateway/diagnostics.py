"""Gateway diagnostics for COM ports and ingest path."""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import httpx
import serial
from serial.tools import list_ports

from gateway.raw_serial_reader import build_line_tag_index, parse_line_to_frames
from gateway.settings import Settings, resolve_tag_map_path


@dataclass(frozen=True, slots=True)
class PortProbe:
    port: str
    available: bool
    detail: str


def list_serial_ports() -> list[dict[str, str]]:
    return [
        {
            "device": port.device,
            "description": port.description,
            "hwid": port.hwid,
        }
        for port in list_ports.comports()
    ]


def probe_port(port: str, *, baudrate: int) -> PortProbe:
    try:
        with serial.Serial(port=port, baudrate=baudrate, timeout=0):
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
    default_tag_id: str,
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
        "parsed": [frame.model_dump(mode="json") for frame in frames],
        "error": "" if frames else "line produced no TagFrames",
    }


def post_line_to_api(
    *,
    line: str,
    api_base: str,
    token: str,
    gateway_id: str,
    default_tag_id: str,
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
            )
            responses.append({"status_code": response.status_code, "body": response.text})
            ok = ok and response.is_success
    return {"ok": ok, "frames": len(frames), "responses": responses, "posted": True}


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect PlantLens gateway COM/API status.")
    parser.add_argument("--port", default="COM3", help="COM port to probe.")
    parser.add_argument("--baudrate", type=int, default=9600, help="Serial baudrate for open probe.")
    parser.add_argument("--api-base", default="http://127.0.0.1:8000", help="PlantLens API base URL.")
    parser.add_argument("--token", default="change-me", help="Gateway ingest token.")
    parser.add_argument("--line", default="", help="Optional raw serial line to parse. Does not post by default.")
    parser.add_argument("--post", action="store_true", help="POST --line frames to API ingest. Intended for explicit test-only use.")
    parser.add_argument("--default-tag-id", default="MOTOR_301_CURRENT", help="Tag for bare numeric lines.")
    parser.add_argument("--gateway-id", default="gw-rs485-1", help="Gateway id for emitted test frames.")
    args = parser.parse_args()

    settings = Settings()
    tag_map_path = resolve_tag_map_path(settings)
    result: dict[str, Any] = {
        "ports": list_serial_ports(),
        "probe": asdict(probe_port(args.port, baudrate=args.baudrate)),
        "api": api_health(args.api_base),
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
