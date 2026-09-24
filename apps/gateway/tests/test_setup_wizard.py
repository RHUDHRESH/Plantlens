"""Setup wizard, stable selectors and per-machine config (no hardware, local HTTP server)."""

from __future__ import annotations

import io
import json
import os
import stat
import threading
from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace

import httpx
import pytest

from gateway import setup_wizard as wiz
from gateway.settings import Settings, config_path, validate_profile
from gateway.transport.discovery import (
    PortIdentity,
    enumerate_ports,
    is_raw_port_name,
    parse_selector,
    resolve,
    stable_selector,
    suggested_mode,
)

TOKEN = "s3cret-token"


def row(device, vid=None, pid=None, sn=None, location=None, description=""):
    return SimpleNamespace(device=device, vid=vid, pid=pid, serial_number=sn, location=location, description=description or device, hwid="")


UNO = row("COM7", 0x2341, 0x0043, "85735313932351B0A1F1", "1-1.3", "Arduino Uno")
CH340_A = row("COM3", 0x1A86, 0x7523, None, "1-1.2", "USB-SERIAL CH340")
CH340_B = row("COM4", 0x1A86, 0x7523, None, "1-1.4", "USB-SERIAL CH340")
FTDI = row("/dev/ttyUSB1", 0x0403, 0x6001, "A10KXYZ", "3-2", "FT232R USB UART")
BUILTIN = row("/dev/ttyS0")


def lister(*rows):
    return lambda: list(rows)


def ident(r) -> PortIdentity:
    return next(p for p in enumerate_ports(lister(r)))


# ------------------------------------------------------------------------ stable selectors


def test_serial_number_is_preferred():
    ports = enumerate_ports(lister(UNO, CH340_A))
    uno = next(p for p in ports if p.device == "COM7")
    choice = stable_selector(uno, ports)
    assert choice.selector == "sn:85735313932351B0A1F1" and choice.kind == "serial" and choice.warning is None
    assert resolve(choice.selector, list_fn=lister(row("COM12", 0x2341, 0x0043, "85735313932351B0A1F1"), CH340_A)).device == "COM12"


def test_duplicate_serial_falls_back_to_vidpid_serial():
    other = row("COM9", 0x0403, 0x6015, "A10KXYZ")
    ports = enumerate_ports(lister(FTDI, other))
    ftdi = next(p for p in ports if p.device == "/dev/ttyUSB1")
    assert stable_selector(ftdi, ports).selector == "0403:6001:A10KXYZ"


def test_no_serial_unique_vidpid_uses_vidpid_with_note():
    ports = enumerate_ports(lister(CH340_A, UNO))
    ch = next(p for p in ports if p.device == "COM3")
    choice = stable_selector(ch, ports)
    assert choice.selector == "1A86:7523" and choice.kind == "vidpid"
    assert choice.warning and "no USB serial number" in choice.warning


def test_two_identical_adapters_use_usb_location_and_resolve_by_it():
    ports = enumerate_ports(lister(CH340_A, CH340_B))
    b = next(p for p in ports if p.device == "COM4")
    choice = stable_selector(b, ports)
    assert choice.selector == "1A86:7523@1-1.4" and choice.kind == "vidpid_location"
    assert "USB socket" in (choice.warning or "")
    # After a reboot the COM numbers swap; the location still finds the same adapter.
    swapped = lister(row("COM4", 0x1A86, 0x7523, None, "1-1.2"), row("COM3", 0x1A86, 0x7523, None, "1-1.4"))
    assert resolve(choice.selector, list_fn=swapped).device == "COM3"
    sel = parse_selector("1A86:7523@1-1.2:1.0")
    assert (sel.kind, sel.serial_number, sel.location) == ("vidpid", None, "1-1.2:1.0")


def test_raw_port_is_last_resort_with_warning():
    choice = stable_selector(ident(BUILTIN), [])
    assert choice.selector == "/dev/ttyS0" and choice.kind == "raw"
    assert "raw port name" in (choice.warning or "")
    assert is_raw_port_name("COM3") and is_raw_port_name("/dev/ttyUSB0")
    assert not is_raw_port_name("sn:ABC") and not is_raw_port_name("/dev/serial/by-id/usb-x")


def test_windows_instance_id_is_not_a_serial_number():
    fake = row("COM5", 0x1A86, 0x7523, "5&2A3B4C5D&0&2")
    assert stable_selector(ident(fake), []).selector == "1A86:7523"


def test_suggested_mode_by_device_type():
    assert suggested_mode(ident(UNO)) == "line"
    assert suggested_mode(ident(CH340_A)) == "modbus"


# ------------------------------------------------------------------------ config file


def test_config_path_defaults_and_profiles(monkeypatch, tmp_path):
    monkeypatch.delenv("PLANTLENS_GATEWAY_CONFIG")
    monkeypatch.setattr("sys.platform", "linux")
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path / "xdg"))
    assert config_path() == tmp_path / "xdg" / "plantlens" / "gateway.env"
    assert config_path("uno") == tmp_path / "xdg" / "plantlens" / "gateway.uno.env"
    monkeypatch.setenv("PLANTLENS_GATEWAY_PROFILE", "rs485")
    assert config_path().name == "gateway.rs485.env"
    monkeypatch.setattr("sys.platform", "win32")
    monkeypatch.setenv("APPDATA", str(tmp_path / "Roaming"))
    assert config_path("") == tmp_path / "Roaming" / "PlantLens" / "gateway.env"
    monkeypatch.setenv("PLANTLENS_GATEWAY_CONFIG", str(tmp_path / "x" / "my.env"))
    assert config_path("") == tmp_path / "x" / "my.env"
    assert config_path("b") == tmp_path / "x" / "gateway.b.env"
    with pytest.raises(ValueError):
        validate_profile("../evil")


def test_settings_precedence_file_below_dotenv_below_env(isolated_machine_config, monkeypatch, tmp_path):
    for key in ("API_BASE_URL", "GATEWAY_ID", "GATEWAY_SERIAL_MODE", "HEALTH_PORT", "GATEWAY_LINK__SELECTOR"):
        monkeypatch.delenv(key, raising=False)
    wiz.write_env_file(
        isolated_machine_config,
        {
            "API_BASE_URL": "http://from-file:8000",
            "GATEWAY_ID": "gw-file",
            "GATEWAY_SERIAL_MODE": "line",
            "HEALTH_PORT": "9105",
            "GATEWAY_LINK__SELECTOR": "sn:ABC123",
        },
    )
    workdir = tmp_path / "cwd"
    workdir.mkdir()
    (workdir / ".env").write_text("GATEWAY_ID=gw-dotenv\n", encoding="utf-8")
    monkeypatch.chdir(workdir)
    monkeypatch.setenv("API_BASE_URL", "http://from-env:8000")
    monkeypatch.setenv("GATEWAY_LINK__RESET_POLICY", "wait_for_reset")
    s = Settings()
    assert s.api_base_url == "http://from-env:8000"  # real env wins
    assert s.gateway_id == "gw-dotenv"  # ./.env beats the machine file
    assert (s.serial_mode, s.health_port, s.link.selector) == ("line", 9105, "sn:ABC123")
    assert s.link.reset_policy == "wait_for_reset"  # nested keys merge across sources
    assert s.link_selector("COM3") == "sn:ABC123"  # beats the tag map's COM3
    monkeypatch.setenv("GATEWAY_SERIAL_PORT", "/dev/ttyUSB9")
    assert Settings().link_selector() == "/dev/ttyUSB9"


def test_write_env_file_is_private_and_round_trips(tmp_path):
    path = tmp_path / "cfg" / "gateway.env"
    token = "a'b\"c$d#e f"
    wiz.write_env_file(path, {"GATEWAY_INGEST_TOKEN": token, "GATEWAY_LINE__COLUMN_MAP": '{"vib":"VIB_X"}'})
    assert wiz.load_env_file(path) == {"GATEWAY_INGEST_TOKEN": token, "GATEWAY_LINE__COLUMN_MAP": '{"vib":"VIB_X"}'}
    if os.name == "posix":
        assert stat.S_IMODE(path.stat().st_mode) == 0o600


def test_refuses_to_write_config_inside_the_repo():
    root = wiz._repo_root()
    if root is None:
        pytest.skip("not running from a git checkout")
    with pytest.raises(wiz.WizardError):
        wiz.write_env_file(root / "apps" / "gateway" / "gateway.env", {"GATEWAY_INGEST_TOKEN": "x"})
    assert not (root / "apps" / "gateway" / "gateway.env").exists()


def test_profile_health_ports_are_assigned_uniquely(tmp_path):
    base = tmp_path / "gateway.env"
    assert wiz.assign_health_port(base, {}) == 9101
    wiz.write_env_file(base, {"HEALTH_PORT": "9101"})
    uno = tmp_path / "gateway.uno.env"
    assert wiz.assign_health_port(uno, {}) == 9102
    wiz.write_env_file(uno, {"HEALTH_PORT": "9102"})
    assert wiz.assign_health_port(tmp_path / "gateway.rs2.env", {}) == 9103
    assert wiz.assign_health_port(uno, {"HEALTH_PORT": "9102"}) == 9102  # re-run keeps its port
    # a default-profile file without HEALTH_PORT still reserves 9101
    base.write_text("GATEWAY_ID=x\n", encoding="utf-8")
    assert wiz.assign_health_port(tmp_path / "gateway.new.env", {}) == 9103


def test_default_gateway_id_is_host_and_profile_specific():
    assert wiz.default_gateway_id("line", None, "Bench-PC.local") == "gw-bench-pc-line"
    assert wiz.default_gateway_id("modbus", "uno2", "WS01") == "gw-ws01-rs485-uno2"


# ------------------------------------------------------------------------ server check


class _FakeApi:
    def __init__(self) -> None:
        self.posts: list[tuple[str, object]] = []
        api = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):  # quiet
                pass

            def _send(self, code: int, body: object) -> None:
                data = json.dumps(body).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_GET(self):
                if self.path == "/healthz":
                    self._send(200, {"status": "ok"})
                else:
                    self._send(404, {"detail": "Not Found"})

            def do_POST(self):
                length = int(self.headers.get("Content-Length") or 0)
                body = json.loads(self.rfile.read(length) or b"null")
                api.posts.append((self.headers.get("Authorization", ""), body))
                if self.path != "/api/ingest/frame/batch":
                    self._send(404, {"detail": "Not Found"})
                elif self.headers.get("Authorization") != f"Bearer {TOKEN}":
                    self._send(401, {"detail": "Invalid gateway ingest token"})
                else:
                    self._send(200, {"status": "ok", "accepted": 0, "total": len(body)})

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"
        self.thread = threading.Thread(target=self.server.serve_forever, name="fake-api", daemon=True)
        self.thread.start()

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(2)


@pytest.fixture
def fake_api() -> Iterator[_FakeApi]:
    api = _FakeApi()
    yield api
    api.close()


def test_check_server_ok_and_wrong_token(fake_api):
    ok = wiz.check_server(fake_api.url, TOKEN)
    assert ok.ok and ok.health_status == 200 and ok.ingest_status == 200
    assert fake_api.posts[-1] == (f"Bearer {TOKEN}", [])  # dry run: empty batch
    bad = wiz.check_server(fake_api.url, "wrong")
    assert not bad.ok and bad.reachable and bad.ingest_status == 401
    assert any("REJECTED" in m for m in bad.messages)


def test_check_server_wrong_url_and_unreachable():
    transport = httpx.MockTransport(lambda req: httpx.Response(404 if req.url.path != "/healthz" else 200))
    res = wiz.check_server("http://web:8080", TOKEN, transport=transport)
    assert not res.ok and any("not the PlantLens API" in m for m in res.messages)
    down = wiz.check_server("http://127.0.0.1:1", TOKEN, timeout=1.0)
    assert not down.reachable and "cannot reach" in down.messages[0]


def test_normalize_server_url():
    assert wiz.normalize_server_url("192.168.1.50:8000/") == "http://192.168.1.50:8000"
    assert wiz.normalize_server_url("https://plant.example") == "https://plant.example"


# ------------------------------------------------------------------------ wizard flows


@pytest.fixture
def no_token_env(monkeypatch):
    monkeypatch.delenv("GATEWAY_INGEST_TOKEN", raising=False)


def _run(argv, *, ports, inputs=None, api=None):
    out = io.StringIO()
    answers = iter(inputs or [])

    def fake_input(prompt: str) -> str:
        out.write(prompt)
        return next(answers)

    code = wiz.run_wizard(argv, input_fn=fake_input, secret_fn=fake_input, out=out, list_fn=lister(*ports))
    return code, out.getvalue()


def test_non_interactive_flow_saves_stable_selector(fake_api, isolated_machine_config, no_token_env):
    code, text = _run(
        ["--yes", "--server", fake_api.url, "--token", TOKEN, "--no-probe"],
        ports=[BUILTIN, UNO],
    )
    assert code == 0, text
    saved = wiz.load_env_file(isolated_machine_config)
    assert saved["GATEWAY_LINK__SELECTOR"] == "sn:85735313932351B0A1F1"
    assert saved["GATEWAY_SERIAL_MODE"] == "line"  # Arduino VID -> line
    assert saved["API_BASE_URL"] == fake_api.url and saved["GATEWAY_INGEST_TOKEN"] == TOKEN
    assert saved["HEALTH_PORT"] == "9101" and "GATEWAY_LINE__COLUMN_MAP" in saved
    assert "ingest token accepted" in text
    # ... and the gateway settings pick it up with no env vars at all
    s = Settings()
    assert (s.link_selector("COM3"), s.serial_mode, s.api_base_url) == ("sn:85735313932351B0A1F1", "line", fake_api.url)


def test_non_interactive_wrong_token_is_explained_and_not_saved(fake_api, isolated_machine_config, no_token_env):
    code, text = _run(["--yes", "--server", fake_api.url, "--token", "nope", "--no-probe"], ports=[CH340_A])
    assert code == 1
    assert "401" in text and "GATEWAY_INGEST_TOKEN" in text
    assert not isolated_machine_config.exists()


def test_unreachable_server_still_saves_with_warning(isolated_machine_config, no_token_env):
    code, text = _run(["--yes", "--server", "127.0.0.1:1", "--token", TOKEN, "--no-probe", "--mode", "modbus"], ports=[CH340_A])
    assert code == 0 and "not reachable" in text
    saved = wiz.load_env_file(isolated_machine_config)
    assert saved["GATEWAY_LINK__SELECTOR"] == "1A86:7523" and saved["GATEWAY_SERIAL_MODE"] == "modbus"


def test_several_ports_need_explicit_choice_non_interactively(isolated_machine_config, no_token_env):
    code, text = _run(["--yes", "--token", TOKEN, "--skip-server-check", "--no-probe"], ports=[CH340_A, UNO])
    assert code == 2 and "--port" in text
    code, _ = _run(["--yes", "--token", TOKEN, "--skip-server-check", "--no-probe", "--port", "COM3"], ports=[CH340_A, UNO])
    assert code == 0
    assert wiz.load_env_file(isolated_machine_config)["GATEWAY_LINK__SELECTOR"] == "1A86:7523"
    code, text = _run(["--yes", "--token", TOKEN, "--skip-server-check", "--no-probe", "--port", "COM99"], ports=[CH340_A])
    assert code == 2 and "does not match" in text


def test_raw_port_choice_warns(isolated_machine_config, no_token_env):
    # a built-in UART is never auto-picked: without --port the selector stays "auto"
    code, text = _run(["--yes", "--token", TOKEN, "--skip-server-check", "--no-probe"], ports=[BUILTIN])
    assert code == 0 and wiz.load_env_file(isolated_machine_config)["GATEWAY_LINK__SELECTOR"] == "auto"
    code, text = _run(
        ["--yes", "--token", TOKEN, "--skip-server-check", "--no-probe", "--port", "/dev/ttyS0"], ports=[BUILTIN]
    )
    assert code == 0 and "WARNING" in text and "raw port name" in text
    assert wiz.load_env_file(isolated_machine_config)["GATEWAY_LINK__SELECTOR"] == "/dev/ttyS0"


def test_missing_token_non_interactive_fails(isolated_machine_config, no_token_env):
    code, text = _run(["--yes", "--skip-server-check", "--no-probe"], ports=[CH340_A])
    assert code == 2 and "--token" in text


def test_interactive_flow_retries_a_wrong_token(fake_api, isolated_machine_config, no_token_env):
    inputs = ["2", "", fake_api.url, "wrong", TOKEN]  # port 2 (the Uno), default mode, url, bad then good token
    code, text = _run(["--no-probe"], ports=[CH340_A, UNO], inputs=inputs)
    assert code == 0, text
    assert "REJECTED" in text and "ingest token accepted" in text
    saved = wiz.load_env_file(isolated_machine_config)
    assert saved["GATEWAY_LINK__SELECTOR"] == "sn:85735313932351B0A1F1" and saved["GATEWAY_SERIAL_MODE"] == "line"
    assert saved["GATEWAY_INGEST_TOKEN"] == TOKEN


def test_interactive_rerun_keeps_saved_values(fake_api, isolated_machine_config, no_token_env):
    assert _run(["--yes", "--server", fake_api.url, "--token", TOKEN, "--no-probe", "--mode", "modbus"], ports=[UNO])[0] == 0
    # Enter everywhere: single known adapter auto-picked, saved mode/url/token kept.
    code, text = _run(["--no-probe"], ports=[UNO], inputs=["", "", ""])
    assert code == 0, text
    saved = wiz.load_env_file(isolated_machine_config)
    assert saved["GATEWAY_SERIAL_MODE"] == "modbus" and saved["API_BASE_URL"] == fake_api.url
    assert "Using the only port" in text


def test_profiles_get_their_own_file_id_and_health_port(fake_api, isolated_machine_config, no_token_env):
    common = ["--yes", "--server", fake_api.url, "--token", TOKEN, "--no-probe"]
    assert _run([*common, "--port", "COM3"], ports=[CH340_A, UNO])[0] == 0
    assert _run([*common, "--port", "COM7", "--profile", "uno"], ports=[CH340_A, UNO])[0] == 0
    base = wiz.load_env_file(isolated_machine_config)
    uno = wiz.load_env_file(isolated_machine_config.with_name("gateway.uno.env"))
    assert (base["HEALTH_PORT"], uno["HEALTH_PORT"]) == ("9101", "9102")
    assert base["GATEWAY_ID"] != uno["GATEWAY_ID"] and uno["GATEWAY_ID"].endswith("-uno")
    assert uno["GATEWAY_LINK__SELECTOR"].startswith("sn:")
    code, text = _run(["--profile", "uno", "--config-path"], ports=[])
    assert code == 0 and text.strip().endswith("gateway.uno.env")


def test_list_and_show(isolated_machine_config, no_token_env):
    code, text = _run(["--list"], ports=[CH340_A, UNO])
    assert code == 0 and "CH340" in text and "sn:85735313932351B0A1F1" in text and "*" in text
    assert _run(["--show"], ports=[])[0] == 1
    wiz.write_env_file(isolated_machine_config, {"GATEWAY_INGEST_TOKEN": TOKEN, "GATEWAY_ID": "gw-x"})
    code, text = _run(["--show"], ports=[])
    assert code == 0 and TOKEN not in text and "GATEWAY_ID=gw-x" in text


# ------------------------------------------------------------------------ line probe


class _FakeSerial:
    def __init__(self, chunks: list[bytes]) -> None:
        self.chunks = chunks
        self.closed = False

    def read(self, _n: int) -> bytes:
        return self.chunks.pop(0) if self.chunks else b""

    def close(self) -> None:
        self.closed = True


def test_probe_line_detects_banner_and_pl1():
    fake = _FakeSerial([b"\x00garbage\r\n#PLANTLENS READY v1 hz=20\r\n", b"PL1,1,vib=1.0*00\r\nPL1,2,vib=1", b".1*00\r\n"])
    result = wiz.probe_line("COM7", seconds=1.0, serial_factory=lambda *a, **k: fake)
    assert result["opened"] and result["banner"] and result["pl1_lines"] == 2 and fake.closed


def test_probe_line_open_failure_is_reported():
    def boom(*_a, **_k):
        raise OSError("Access is denied")

    result = wiz.probe_line("COM7", seconds=0.1, serial_factory=boom)
    assert not result["opened"] and "denied" in result["error"]


def test_config_report_flags_raw_selector(isolated_machine_config, monkeypatch):
    from gateway.diagnostics import config_report

    monkeypatch.setenv("GATEWAY_SERIAL_PORT", "COM3")
    report = config_report(Settings())
    assert report["path"] == str(isolated_machine_config) and "warning" in report
    monkeypatch.setenv("GATEWAY_SERIAL_PORT", "sn:ABC")
    assert "warning" not in config_report(Settings())
