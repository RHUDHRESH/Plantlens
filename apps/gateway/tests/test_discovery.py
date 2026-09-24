"""VID/PID discovery tests with a fake port enumeration."""

from __future__ import annotations

import os
from types import SimpleNamespace

import pytest

from gateway.transport.discovery import DiscoveryError, PortIdentity, parse_selector, resolve


def port(device: str, vid: int | None = None, pid: int | None = None, sn: str | None = None, location: str | None = None):
    return SimpleNamespace(device=device, vid=vid, pid=pid, serial_number=sn, location=location, description=device, hwid="")


CH340 = port("/dev/ttyUSB0", 0x1A86, 0x7523, None, "1-1.2")
UNO = port("/dev/ttyACM0", 0x2341, 0x0043, "85735313932351B0A1F1")
FTDI = port("/dev/ttyUSB1", 0x0403, 0x6001, "A10KXYZ")
BUILTIN = port("/dev/ttyS0")


def lister(*rows):
    return lambda: list(rows)


def test_selector_parsing():
    assert parse_selector(None).kind == "auto"
    assert parse_selector("auto").kind == "auto"
    sel = parse_selector("1a86:7523")
    assert (sel.kind, sel.vid, sel.pid) == ("vidpid", 0x1A86, 0x7523)
    sel = parse_selector("2341:0043:85735313932351B0A1F1")
    assert sel.serial_number == "85735313932351B0A1F1"
    assert parse_selector("sn:A10KXYZ").serial_number == "A10KXYZ"
    assert parse_selector("/dev/serial/by-id/usb-FTDI").kind == "path"


def test_auto_picks_the_single_known_adapter_and_ignores_builtin_uarts():
    ident = resolve(None, list_fn=lister(BUILTIN, CH340))
    assert ident.device == "/dev/ttyUSB0" and ident.adapter == "CH340"


def test_auto_with_multiple_candidates_errors_and_lists_them():
    with pytest.raises(DiscoveryError) as err:
        resolve("auto", list_fn=lister(CH340, UNO))
    assert {c.device for c in err.value.candidates} == {"/dev/ttyUSB0", "/dev/ttyACM0"}
    assert "never" not in str(err.value) and "2 serial ports match" in str(err.value)


def test_auto_with_no_candidates_errors():
    with pytest.raises(DiscoveryError):
        resolve(None, list_fn=lister(BUILTIN))


def test_vidpid_serial_and_wildcard_vendor():
    assert resolve("2341:0043", list_fn=lister(CH340, UNO)).adapter == "Arduino"
    assert resolve("sn:A10KXYZ", list_fn=lister(CH340, UNO, FTDI)).device == "/dev/ttyUSB1"
    with pytest.raises(DiscoveryError):
        resolve("0403:6015", list_fn=lister(FTDI))


def test_foreign_platform_selector_falls_back_to_unique_auto():
    if os.name == "nt":
        pytest.skip("POSIX-only check")
    assert resolve("COM3", list_fn=lister(UNO)).device == "/dev/ttyACM0"
    with pytest.raises(DiscoveryError):
        resolve("COM3", list_fn=lister(UNO, CH340))


def test_missing_explicit_path_is_an_error_not_a_guess():
    with pytest.raises(DiscoveryError):
        resolve("/dev/ttyPLANTLENS_NOPE", list_fn=lister(UNO))


def test_rediscovery_follows_identity_to_a_new_device_name():
    previous = resolve("/dev/ttyACM0", list_fn=lister(UNO), path_exists=lambda p: p == "/dev/ttyACM0")
    assert previous.serial_number == UNO.serial_number
    moved = port("/dev/ttyACM1", 0x2341, 0x0043, UNO.serial_number)
    ident = resolve("/dev/ttyACM0", previous=previous, list_fn=lister(moved, CH340), path_exists=lambda p: False)
    assert ident.device == "/dev/ttyACM1"


def test_identity_without_serial_uses_usb_location():
    a = PortIdentity("/dev/ttyUSB0", 0x1A86, 0x7523, location="1-1.2")
    b = PortIdentity("/dev/ttyUSB3", 0x1A86, 0x7523, location="1-1.2")
    c = PortIdentity("/dev/ttyUSB4", 0x1A86, 0x7523, location="1-1.3")
    assert a.same_hardware(b) and not a.same_hardware(c)
