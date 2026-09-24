"""First-run setup for a gateway PC: pick the device, test the server, save a per-machine config.

    python -m gateway.setup_wizard                    # interactive
    python -m gateway.setup_wizard --list             # show serial ports and exit
    python -m gateway.setup_wizard --yes --server http://192.168.1.50:8000 --token XXX
    python -m gateway.setup_wizard --profile uno      # second device on the same PC

The device is saved as a *stable* selector (``sn:<serial>``, ``VID:PID``, ``VID:PID@location``)
rather than ``COM5``/``/dev/ttyUSB0``, so the gateway finds it again after a reboot, in another USB
socket or on another PC. The config file lives outside the repo (see ``gateway.settings``), is
``chmod 600`` on POSIX, and is loaded automatically by ``python -m gateway.main``.

Plain stdin/stdout, no dependencies beyond the gateway's own.
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import os
import re
import socket
import sys
import time
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, TextIO

import httpx

from gateway.settings import CONFIG_ENV, PROFILE_ENV, config_path, validate_profile
from gateway.transport.discovery import (
    DiscoveryError,
    ListFn,
    PortIdentity,
    StableSelector,
    enumerate_ports,
    friendly_name,
    parse_selector,
    resolve,
    stable_selector,
    suggested_mode,
)

BASE_HEALTH_PORT = 9101
DEFAULT_SERVER = "http://localhost:8000"
# Keys of the plain Uno sketch (arduino/uno_plain) mapped onto demo tag ids.
DEFAULT_LINE_COLUMN_MAP = '{"vib":"VIB_X","current":"MOTOR_301_CURRENT","voltage":"BUS_101_V","temp":"MOTOR_301_TEMP"}'
LINE_BAUD = 115200
MODE_CHOICES = ("modbus", "line")


class WizardError(RuntimeError):
    """A problem the user must fix; printed without a traceback."""

    def __init__(self, message: str, code: int = 2) -> None:
        super().__init__(message)
        self.code = code


# --------------------------------------------------------------------------------- config file


def load_env_file(path: Path) -> dict[str, str]:
    if not path.is_file():
        return {}
    from dotenv import dotenv_values  # dependency of pydantic-settings

    return {k: v for k, v in dotenv_values(path).items() if v is not None}


def _quote(value: str) -> str:
    if "'" not in value and "\n" not in value:
        return f"'{value}'"
    escaped = value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    return f'"{escaped}"'


def _repo_root() -> Path | None:
    for parent in Path(__file__).resolve().parents:
        if (parent / ".git").exists():
            return parent
    return None


def write_env_file(path: Path, values: dict[str, str], *, header: str = "") -> None:
    """Write *values* as a dotenv file, owner-only (0600) on POSIX. Refuses paths in the repo."""
    root = _repo_root()
    resolved = path.expanduser().resolve()
    if root is not None and resolved.is_relative_to(root):
        msg = (
            f"refusing to write the gateway config (it holds the ingest token) inside the repository: "
            f"{resolved}. Unset {CONFIG_ENV} or point it outside {root}."
        )
        raise WizardError(msg)
    resolved.parent.mkdir(parents=True, exist_ok=True)
    lines = [f"# {line}".rstrip() for line in header.splitlines()]
    lines += [f"{key}={_quote(str(value))}" for key, value in values.items()]
    data = "\n".join(lines) + "\n"
    tmp = resolved.with_name(resolved.name + ".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(data)
    if os.name == "posix":
        os.chmod(tmp, 0o600)
    os.replace(tmp, resolved)


def _profile_files(directory: Path) -> Iterable[Path]:
    if not directory.is_dir():
        return []
    return sorted(p for p in directory.iterdir() if re.match(r"^gateway(\.[A-Za-z0-9_-]+)?\.env$", p.name))


def assign_health_port(path: Path, existing: dict[str, str]) -> int:
    """Keep this profile's HEALTH_PORT; otherwise the lowest port from 9101 no other profile uses."""
    current = existing.get("HEALTH_PORT")
    if current and current.isdigit():
        return int(current)
    used: set[int] = set()
    for other in _profile_files(path.parent):
        if other.resolve() == path.resolve():
            continue
        port = load_env_file(other).get("HEALTH_PORT", str(BASE_HEALTH_PORT))
        if port.isdigit():
            used.add(int(port))
    port = BASE_HEALTH_PORT
    while port in used:
        port += 1
    return port


def default_gateway_id(mode: str, profile: str | None, hostname: str | None = None) -> str:
    host = re.sub(r"[^a-z0-9-]+", "-", (hostname or socket.gethostname()).split(".")[0].lower()).strip("-") or "pc"
    kind = "line" if mode == "line" else "rs485"
    suffix = f"-{profile.lower()}" if profile else ""
    return f"gw-{host[:24]}-{kind}{suffix}"


# --------------------------------------------------------------------------------- server test


@dataclass
class ServerCheck:
    url: str
    reachable: bool = False
    health_status: int | None = None
    ingest_status: int | None = None
    token_ok: bool = False
    messages: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.reachable and self.token_ok


def normalize_server_url(raw: str) -> str:
    url = raw.strip().rstrip("/")
    if not url:
        return DEFAULT_SERVER
    if not re.match(r"^https?://", url, re.IGNORECASE):
        url = "http://" + url
    return url


def check_server(url: str, token: str, *, transport: httpx.BaseTransport | None = None, timeout: float = 5.0) -> ServerCheck:
    """GET /healthz, then POST an EMPTY batch to the ingest endpoint (no data is written)."""
    result = ServerCheck(url=url)
    with httpx.Client(timeout=timeout, transport=transport) as client:
        try:
            health = client.get(f"{url}/healthz")
        except httpx.HTTPError as exc:
            result.messages.append(
                f"cannot reach {url} ({type(exc).__name__}: {exc}). Check the server IP and port "
                "(the API is port 8000), that the server is running, and that its firewall allows it."
            )
            return result
        result.reachable = True
        result.health_status = health.status_code
        if health.is_success:
            result.messages.append(f"server reachable: GET /healthz -> {health.status_code}")
        else:
            result.messages.append(f"GET /healthz answered {health.status_code}; is {url} the PlantLens API?")
        try:
            ingest = client.post(
                f"{url}/api/ingest/frame/batch",
                headers={"Authorization": f"Bearer {token}"},
                json=[],
            )
        except httpx.HTTPError as exc:
            result.messages.append(f"ingest test failed: {type(exc).__name__}: {exc}")
            return result
        result.ingest_status = ingest.status_code
        if ingest.status_code == 200:
            result.token_ok = True
            result.messages.append("ingest token accepted (empty test batch, nothing stored)")
        elif ingest.status_code == 401:
            result.messages.append(
                "the server REJECTED the ingest token (401). Use exactly the GATEWAY_INGEST_TOKEN value "
                "set on the server (deploy/docker/.env or the API's environment)."
            )
        elif ingest.status_code == 404:
            result.messages.append(
                "POST /api/ingest/frame/batch -> 404: this URL is not the PlantLens API (use port 8000)."
            )
        else:
            result.messages.append(f"POST /api/ingest/frame/batch -> {ingest.status_code}: {ingest.text[:200]}")
    return result


# --------------------------------------------------------------------------------- port probes


def probe_line(device: str, *, baudrate: int = LINE_BAUD, seconds: float = 3.0, serial_factory: Callable[..., Any] | None = None) -> dict[str, Any]:
    """Read up to *seconds* and report whether the PlantLens banner / PL1 lines were seen.

    Opening with DTR asserted resets an Uno, which then prints ``#PLANTLENS READY`` after boot.
    """
    import serial

    factory = serial_factory or serial.Serial
    out: dict[str, Any] = {"device": device, "opened": False, "banner": False, "pl1_lines": 0, "other_lines": 0, "sample": []}
    try:
        ser = factory(device, baudrate=baudrate, timeout=0.2)
    except Exception as exc:  # noqa: BLE001 - report any open failure
        out["error"] = f"{type(exc).__name__}: {exc}"
        return out
    out["opened"] = True
    buf = b""
    deadline = time.monotonic() + seconds
    try:
        while time.monotonic() < deadline:
            buf += ser.read(512) or b""
            while b"\n" in buf:
                raw, buf = buf.split(b"\n", 1)
                line = raw.decode("utf-8", "replace").strip()
                if not line:
                    continue
                if line.startswith("#PLANTLENS READY"):
                    out["banner"] = True
                elif line.startswith("PL1,"):
                    out["pl1_lines"] += 1
                else:
                    out["other_lines"] += 1
                if len(out["sample"]) < 3:
                    out["sample"].append(line[:120])
            if out["banner"] and out["pl1_lines"] >= 2:
                break
    except Exception as exc:  # noqa: BLE001
        out["error"] = f"{type(exc).__name__}: {exc}"
    finally:
        try:
            ser.close()
        except Exception:  # noqa: BLE001, S110 - best-effort close
            pass
    return out


async def _modbus_scan_once(selector: str, timeout_s: float) -> dict[str, Any]:
    import json

    from gateway.main import GatewayRuntime, build_scan_engine  # the real scan code
    from gateway.settings import Settings, resolve_tag_map_path

    settings = Settings(GATEWAY_SERIAL_PORT=selector)
    tag_map = json.loads(resolve_tag_map_path(settings).read_text(encoding="utf-8"))
    frames: list[Any] = []

    async def publish(frame: Any) -> None:
        frames.append(frame)

    runtime = GatewayRuntime()
    engine = build_scan_engine(settings, tag_map, publish, runtime)
    rtu = [d for d in engine.devices if d.source == "modbus_rtu"]
    if not rtu or not runtime.links:
        return {"ran": False, "detail": "tag map has no Modbus RTU source with register tags"}
    link = runtime.links[0]
    try:
        await link.start()
        if not await link.wait_connected(timeout_s):
            return {"ran": False, "detail": f"port did not open: {link.state.as_dict().get('last_error')}"}
        await engine.scan_once(rtu[0])
    finally:
        for lk in runtime.links:
            await lk.stop()
    good = sum(1 for f in frames if f.quality == "GOOD")
    diag = rtu[0].diag.as_dict()
    return {
        "ran": True,
        "source_id": rtu[0].source_id,
        "unit_id": rtu[0].unit_id,
        "frames": len(frames),
        "good": good,
        "timeouts": diag.get("timeouts", 0),
        "crc_errors": diag.get("crc_errors", 0),
        "last_error": diag.get("last_error"),
    }


def probe_modbus(selector: str, *, timeout_s: float = 3.0) -> dict[str, Any]:
    """One real scan cycle of the first RTU device in the tag map (read-only FC03/04...)."""
    try:
        return asyncio.run(asyncio.wait_for(_modbus_scan_once(selector, timeout_s), timeout_s + 5.0))
    except Exception as exc:  # noqa: BLE001 - probe is best-effort
        return {"ran": False, "detail": f"{type(exc).__name__}: {exc}"}


# --------------------------------------------------------------------------------- wizard


class Console:
    def __init__(self, *, interactive: bool, input_fn: Callable[[str], str], out: TextIO, secret_fn: Callable[[str], str] | None = None) -> None:
        self.interactive = interactive
        self._input = input_fn
        self._secret = secret_fn or input_fn
        self.out = out

    def say(self, text: str = "") -> None:
        print(text, file=self.out, flush=True)

    def ask(self, prompt: str, default: str = "", *, secret: bool = False) -> str:
        if not self.interactive:
            return default
        shown = "" if not default else (" [keep saved]" if secret else f" [{default}]")
        try:
            answer = (self._secret if secret else self._input)(f"{prompt}{shown}: ")
        except EOFError:
            return default
        return answer.strip() or default

    def confirm(self, prompt: str, default: bool) -> bool:
        if not self.interactive:
            return default
        answer = self.ask(f"{prompt} ({'Y/n' if default else 'y/N'})", "").lower()
        if not answer:
            return default
        return answer.startswith("y")


def print_ports(con: Console, ports: list[PortIdentity]) -> None:
    if not ports:
        con.say("  (no serial ports found)")
        return
    for index, port in enumerate(ports, 1):
        mark = "*" if port.is_known_adapter else " "
        stable = stable_selector(port, ports)
        con.say(f" {mark}{index:>2}) {friendly_name(port)}")
        con.say(f"       saved as: {stable.selector}   suggested mode: {suggested_mode(port)}")
    con.say("  * = recognised USB-serial adapter or Arduino")


def _match_port_arg(arg: str, ports: list[PortIdentity], list_fn: ListFn | None) -> PortIdentity | None:
    text = arg.strip()
    if text.isdigit() and 1 <= int(text) <= len(ports):
        return ports[int(text) - 1]
    for port in ports:
        same = port.device.lower() == text.lower() if os.name == "nt" else port.device == text
        if same or port.by_id == text:
            return port
    if parse_selector(text).kind not in {"serial", "vidpid"}:
        return None  # a port name that is not present; never let resolve() treat it as "auto"
    try:
        return resolve(text, list_fn=list_fn)
    except DiscoveryError:
        return None


def _default_port(ports: list[PortIdentity], previous_selector: str | None, list_fn: ListFn | None) -> PortIdentity | None:
    if previous_selector and previous_selector != "auto":
        try:
            return resolve(previous_selector, list_fn=list_fn)
        except DiscoveryError:
            pass
    known = [p for p in ports if p.is_known_adapter]
    if len(known) == 1:
        return known[0]
    return None  # never auto-pick a built-in UART or one of several adapters


def choose_port(con: Console, args: argparse.Namespace, previous: dict[str, str], list_fn: ListFn | None) -> tuple[PortIdentity | None, list[PortIdentity]]:
    ports = enumerate_ports(list_fn)
    prev_sel = previous.get("GATEWAY_LINK__SELECTOR") or previous.get("GATEWAY_SERIAL_PORT")
    if args.port:
        if args.port.strip().lower() == "auto":
            return None, ports
        port = _match_port_arg(args.port, ports, list_fn)
        if port is None:
            if os.path.exists(args.port):
                return PortIdentity(device=args.port), ports
            con.say("Serial ports on this PC:")
            print_ports(con, ports)
            raise WizardError(f"--port {args.port!r} does not match any serial port on this PC")
        return port, ports

    con.say("Serial ports on this PC:")
    print_ports(con, ports)
    default = _default_port(ports, prev_sel, list_fn)
    if not con.interactive:
        if default is not None:
            return default, ports
        if not any(p.is_known_adapter for p in ports):
            con.say("WARNING: no USB-serial adapter or Arduino found; saving selector 'auto' (plug the device in before starting).")
            return None, ports
        raise WizardError("several serial ports and none recognised as THE device; pass --port N (number from the list), COMx or sn:SERIAL")

    while True:
        if not ports:
            answer = con.ask("No serial port found. Plug the device in and press Enter to rescan, or type 'skip'", "")
            if answer.lower() == "skip":
                return None, ports
            ports = enumerate_ports(list_fn)
            print_ports(con, ports)
            default = _default_port(ports, prev_sel, list_fn)
            continue
        if default is not None and len(ports) == 1:
            con.say(f"Using the only port: {friendly_name(default)}")
            return default, ports
        dflt = str(ports.index(default) + 1) if default in ports else ("1" if len(ports) == 1 else "")
        answer = con.ask("Pick the port number (r = rescan)", dflt)
        if answer.lower() == "r":
            ports = enumerate_ports(list_fn)
            print_ports(con, ports)
            default = _default_port(ports, prev_sel, list_fn)
            continue
        port = _match_port_arg(answer, ports, list_fn) if answer else None
        if port is not None:
            return port, ports
        con.say(f"  '{answer}' is not in the list; type a number from 1 to {len(ports)}.")


def choose_mode(
    con: Console,
    args: argparse.Namespace,
    previous: dict[str, str],
    port: PortIdentity | None,
    selector: StableSelector | None = None,
) -> str:
    if args.mode:
        mode = "modbus" if args.mode.startswith("modbus") else args.mode
        if mode not in MODE_CHOICES:
            raise WizardError(f"--mode must be modbus or line, not {args.mode!r}")
        return mode
    same_device = selector is not None and previous.get("GATEWAY_LINK__SELECTOR") == selector.selector
    guess = suggested_mode(port) if port is not None else None
    if same_device and previous.get("GATEWAY_SERIAL_MODE"):
        guess = previous["GATEWAY_SERIAL_MODE"]
    default = guess or previous.get("GATEWAY_SERIAL_MODE") or "modbus"
    default = "modbus" if default.startswith("modbus") else default
    while True:
        answer = con.ask("Mode: 'modbus' (RS-485 Modbus RTU) or 'line' (Arduino PL1 text)", default).lower()
        if answer in {"1", "m", "rs485", "rs-485"} or answer.startswith("modbus"):
            return "modbus"
        if answer in {"2", "l", "arduino", "uno", "line"}:
            return "line"
        con.say("  type modbus or line")


def choose_server(con: Console, args: argparse.Namespace, previous: dict[str, str], transport: httpx.BaseTransport | None) -> tuple[str, str, ServerCheck | None]:
    url = normalize_server_url(args.server or con.ask("PlantLens server URL", previous.get("API_BASE_URL", DEFAULT_SERVER)))
    token = args.token or os.environ.get("GATEWAY_INGEST_TOKEN") or ""
    saved = previous.get("GATEWAY_INGEST_TOKEN", "")
    attempts = 0
    while True:
        if not token:
            token = con.ask("Gateway ingest token (same as GATEWAY_INGEST_TOKEN on the server)", saved, secret=True)
        if not token:
            if not con.interactive:
                raise WizardError("no ingest token: pass --token (the server's GATEWAY_INGEST_TOKEN)")
            con.say("  the token is required")
            continue
        if args.skip_server_check:
            return url, token, None
        con.say(f"Testing {url} ...")
        check = check_server(url, token, transport=transport)
        for message in check.messages:
            con.say(f"  {message}")
        if check.ok or not check.reachable:
            return url, token, check
        if check.ingest_status == 401 and con.interactive and attempts < 2:
            attempts += 1
            token = ""
            saved = ""
            continue
        return url, token, check


def run_probe(con: Console, mode: str, port: PortIdentity | None, selector: StableSelector | None) -> None:
    if port is None or selector is None:
        return
    if mode == "line":
        con.say(f"Listening on {port.device} for 3 s ({LINE_BAUD} baud) ...")
        result = probe_line(port.device)
        if not result["opened"]:
            con.say(f"  could not open {port.device}: {result.get('error')}")
            con.say("  (close the Arduino IDE serial monitor / any other gateway; on Linux join the 'dialout' group)")
        elif result["banner"] or result["pl1_lines"]:
            con.say(f"  OK: banner={'yes' if result['banner'] else 'no'}, PL1 lines={result['pl1_lines']}")
        elif result["other_lines"]:
            con.say(f"  data seen but not PL1 (e.g. {result['sample'][:1]}); set GATEWAY_LINE__COLUMN_MAP / __PROTOCOL for your sketch")
        else:
            con.say("  no data in 3 s: is the PlantLens sketch flashed (arduino/uno_plain) and the baud 115200?")
        return
    con.say(f"Reading the first Modbus device once through {selector.selector} ...")
    result = probe_modbus(selector.selector)
    if not result.get("ran"):
        con.say(f"  scan not run: {result.get('detail')}")
    elif result["good"]:
        con.say(f"  OK: {result['good']}/{result['frames']} tags GOOD from {result['source_id']} unit {result['unit_id']}")
    else:
        con.say(
            f"  port opened but no GOOD reads (timeouts={result['timeouts']}, crc={result['crc_errors']}, "
            f"last_error={result['last_error']}). Check A/B wiring, slave id, baud/parity in the tag map."
        )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m gateway.setup_wizard", description="Set up the PlantLens gateway on this PC.")
    parser.add_argument("--list", action="store_true", help="list serial ports and exit")
    parser.add_argument("--port", help="port number from --list, COMx, /dev/tty..., sn:SERIAL, VID:PID, or 'auto'")
    parser.add_argument("--mode", help="modbus (RS-485) or line (Arduino PL1)")
    parser.add_argument("--server", help="server URL, e.g. http://192.168.1.50:8000")
    parser.add_argument("--token", help="ingest token (the server's GATEWAY_INGEST_TOKEN)")
    parser.add_argument("--gateway-id", help="gateway id (default gw-<hostname>-<rs485|line>[-profile])")
    parser.add_argument("--profile", help=f"config profile for a second device on this PC (or ${PROFILE_ENV})")
    parser.add_argument("--config", help=f"config file path (default: per-user, or ${CONFIG_ENV})")
    parser.add_argument("--yes", "-y", action="store_true", help="non-interactive: accept defaults, never prompt")
    parser.add_argument("--no-probe", action="store_true", help="do not open the serial port")
    parser.add_argument("--skip-server-check", action="store_true", help="do not contact the server")
    parser.add_argument("--force", action="store_true", help="save even if the server rejected the token")
    parser.add_argument("--config-path", action="store_true", help="print the config file path and exit")
    parser.add_argument("--show", action="store_true", help="print the saved config (token masked) and exit")
    return parser


def run_wizard(
    argv: list[str] | None = None,
    *,
    input_fn: Callable[[str], str] = input,
    secret_fn: Callable[[str], str] | None = None,
    out: TextIO | None = None,
    list_fn: ListFn | None = None,
    transport: httpx.BaseTransport | None = None,
) -> int:
    args = build_parser().parse_args(argv)
    out = out or sys.stdout
    con = Console(interactive=not args.yes, input_fn=input_fn, out=out, secret_fn=secret_fn or (getpass.getpass if input_fn is input else None))
    try:
        profile = validate_profile(args.profile if args.profile is not None else os.environ.get(PROFILE_ENV))
        path = Path(args.config).expanduser() if args.config else config_path(profile or "")
        previous = load_env_file(path)
        if args.config_path:
            con.say(str(path))
            return 0
        if args.show:
            con.say(f"# {path} ({'exists' if previous else 'missing'})")
            for key, value in previous.items():
                con.say(f"{key}={'***' if 'TOKEN' in key else value}")
            return 0 if previous else 1
        if args.list:
            print_ports(con, enumerate_ports(list_fn))
            return 0

        con.say(f"PlantLens gateway setup{f' (profile {profile})' if profile else ''} -> {path}")
        port, ports = choose_port(con, args, previous, list_fn)
        selector = stable_selector(port, ports) if port is not None else None
        if selector is not None:
            con.say(f"Device selector: {selector.selector}")
            if selector.warning:
                con.say(f"WARNING: {selector.warning}")
        mode = choose_mode(con, args, previous, port, selector)
        url, token, check = choose_server(con, args, previous, transport)
        if check is not None and not check.ok:
            if check.ingest_status == 401 and not args.force:
                raise WizardError("not saved: the server rejected the ingest token (use --force to save anyway)", code=1)
            if check.reachable and not check.token_ok and not args.force and not con.confirm("Save anyway?", False):
                raise WizardError("not saved", code=1)
            if not check.reachable:
                con.say("WARNING: server not reachable now; saving anyway (the gateway retries until it is up).")
        if not args.no_probe:
            run_probe(con, mode, port, selector)

        values = dict(previous)
        values.update(
            {
                "API_BASE_URL": url,
                "GATEWAY_INGEST_TOKEN": token,
                "GATEWAY_SERIAL_MODE": mode,
                "GATEWAY_LINK__SELECTOR": selector.selector if selector else "auto",
                "GATEWAY_ID": args.gateway_id or previous.get("GATEWAY_ID") or default_gateway_id(mode, profile),
                "HEALTH_PORT": str(assign_health_port(path, previous)),
            }
        )
        values.pop("GATEWAY_SERIAL_PORT", None)  # would override the stable selector
        if mode == "line":
            values.setdefault("GATEWAY_LINE__COLUMN_MAP", DEFAULT_LINE_COLUMN_MAP)
        header = (
            "PlantLens gateway config, written by `python -m gateway.setup_wizard`.\n"
            "Real environment variables override these values. Keep this file private (ingest token)."
        )
        write_env_file(path, values, header=header)
        con.say(f"Saved {path}")
        con.say(f"  mode={mode}  device={values['GATEWAY_LINK__SELECTOR']}  id={values['GATEWAY_ID']}  health=:{values['HEALTH_PORT']}")
        run = f"{PROFILE_ENV}={profile} python -m gateway.main" if profile else "python -m gateway.main"
        con.say(f"Start the gateway with the launcher (scripts/start-gateway.*) or: {run}")
        if mode == "line" and sys.platform.startswith("linux") and port is not None:
            con.say(f"Uno on Linux: run `stty -F {port.device} -hupcl` once per boot so opening the port does not reset it.")
        return 0
    except WizardError as exc:
        con.say(f"ERROR: {exc}")
        return exc.code
    except KeyboardInterrupt:
        con.say("\ncancelled, nothing saved")
        return 130


def main() -> None:
    raise SystemExit(run_wizard())


if __name__ == "__main__":
    main()
