"""Serial port discovery by USB VID/PID, serial number, by-id path or explicit port.

Rules:

* A configured selector is matched exactly; it is never "corrected" to a different device.
* With no selector (``auto``) exactly one known USB-serial adapter must be present. Zero or several
  candidates raise :class:`DiscoveryError` listing what was seen. The gateway never guesses.
* A selector written for the other OS (``COM3`` on Linux, ``/dev/ttyUSB0`` on Windows, e.g. from
  a shared tag map) is treated as ``auto`` with a warning, so the same unique-candidate rule applies.
* After a first successful open the link remembers a :class:`PortIdentity`; rediscovery after a
  hotplug prefers that identity (VID/PID + serial number, then by-id path) over the device name,
  because ``/dev/ttyACM0`` commonly comes back as ``/dev/ttyACM1``.
"""

from __future__ import annotations

import os
import re
from collections.abc import Callable, Iterable
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Literal

from serial.tools import list_ports

# Known USB-serial bridges (exact VID:PID) and whole-vendor wildcards (Arduino boards).
KNOWN_ADAPTERS: dict[tuple[int, int], str] = {
    (0x1A86, 0x7523): "CH340",
    (0x1A86, 0x55D4): "CH9102",
    (0x10C4, 0xEA60): "CP210x",
    (0x0403, 0x6001): "FTDI FT232R",
    (0x0403, 0x6015): "FTDI FT-X",
    (0x067B, 0x2303): "Prolific PL2303",
}
KNOWN_VENDORS: dict[int, str] = {
    0x2341: "Arduino",
    0x2A03: "Arduino (arduino.org)",
}

BY_ID_DIR = Path("/dev/serial/by-id")
_VIDPID_RE = re.compile(r"^(?:usb:)?([0-9a-fA-F]{4}):([0-9a-fA-F]{4})(?::(.+))?$")


class DiscoveryError(RuntimeError):
    """No unique port matches the selector. ``candidates`` lists what was enumerated."""

    def __init__(self, message: str, candidates: Iterable[PortIdentity] = ()) -> None:
        self.candidates = list(candidates)
        detail = ", ".join(c.describe() for c in self.candidates) or "none"
        super().__init__(f"{message}; ports seen: [{detail}]")


@dataclass(frozen=True, slots=True)
class PortIdentity:
    device: str
    vid: int | None = None
    pid: int | None = None
    serial_number: str | None = None
    by_id: str | None = None
    location: str | None = None
    description: str = ""
    adapter: str | None = None

    @property
    def is_known_adapter(self) -> bool:
        return self.adapter is not None

    def describe(self) -> str:
        usb = f" {self.vid:04X}:{self.pid:04X}" if self.vid is not None and self.pid is not None else ""
        sn = f" sn={self.serial_number}" if self.serial_number else ""
        name = f" ({self.adapter})" if self.adapter else ""
        return f"{self.device}{usb}{sn}{name}"

    def same_hardware(self, other: PortIdentity) -> bool:
        """True when *other* is the same physical adapter (possibly under a new device name)."""
        if self.vid is not None and self.vid == other.vid and self.pid == other.pid:
            if self.serial_number:
                return self.serial_number == other.serial_number
            if self.location:
                return self.location == other.location
        if self.by_id and other.by_id:
            return self.by_id == other.by_id
        return False

    def as_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["vid"] = f"{self.vid:04X}" if self.vid is not None else None
        data["pid"] = f"{self.pid:04X}" if self.pid is not None else None
        return data


@dataclass(frozen=True, slots=True)
class Selector:
    kind: Literal["auto", "vidpid", "serial", "path"]
    value: str = ""
    vid: int | None = None
    pid: int | None = None
    serial_number: str | None = None

    def __str__(self) -> str:
        return self.value or self.kind


def adapter_name(vid: int | None, pid: int | None) -> str | None:
    if vid is None or pid is None:
        return None
    return KNOWN_ADAPTERS.get((vid, pid)) or KNOWN_VENDORS.get(vid)


def parse_selector(raw: str | None) -> Selector:
    """Parse ``auto`` | ``1A86:7523`` | ``1A86:7523:SERIAL`` | ``sn:SERIAL`` | port path/name."""
    text = (raw or "").strip()
    if not text or text.lower() == "auto":
        return Selector("auto")
    lower = text.lower()
    if lower.startswith(("sn:", "serial:")):
        return Selector("serial", text, serial_number=text.split(":", 1)[1])
    match = _VIDPID_RE.match(text)
    if match:
        return Selector(
            "vidpid",
            text,
            vid=int(match.group(1), 16),
            pid=int(match.group(2), 16),
            serial_number=match.group(3),
        )
    return Selector("path", text)


def _foreign_platform_path(path: str) -> bool:
    is_com = re.match(r"^COM\d+$", path, re.I) is not None
    if os.name == "nt":
        return path.startswith("/dev/")
    return is_com


def _by_id_links() -> dict[str, str]:
    """Map realpath(device) -> /dev/serial/by-id/... link (Linux only)."""
    out: dict[str, str] = {}
    try:
        for link in BY_ID_DIR.iterdir():
            out[os.path.realpath(link)] = str(link)
    except OSError:
        pass
    return out


ListFn = Callable[[], list[Any]]


def enumerate_ports(list_fn: ListFn | None = None) -> list[PortIdentity]:
    """Enumerate serial ports as stable identities (known adapters first)."""
    rows = (list_fn or list_ports.comports)()
    by_id = _by_id_links()
    out: list[PortIdentity] = []
    for row in rows:
        vid = getattr(row, "vid", None)
        pid = getattr(row, "pid", None)
        device = str(row.device)
        out.append(
            PortIdentity(
                device=device,
                vid=vid,
                pid=pid,
                serial_number=getattr(row, "serial_number", None) or None,
                by_id=by_id.get(os.path.realpath(device)),
                location=getattr(row, "location", None) or None,
                description=str(getattr(row, "description", "") or ""),
                adapter=adapter_name(vid, pid),
            )
        )
    out.sort(key=lambda p: (not p.is_known_adapter, p.device))
    return out


def _explicit_path_identity(path: str, ports: list[PortIdentity]) -> PortIdentity:
    real = os.path.realpath(path)
    for port in ports:
        if os.path.realpath(port.device) == real:
            by_id = path if path.startswith(str(BY_ID_DIR)) else port.by_id
            return PortIdentity(**{**asdict(port), "by_id": by_id})
    # Not a USB device pyserial knows about (pty, socat link, built-in UART). Keep the path the
    # user gave (a stable symlink stays stable across re-creation of the target).
    return PortIdentity(device=path, by_id=path if path.startswith(str(BY_ID_DIR)) else None)


def resolve(
    selector: Selector | str | None,
    *,
    previous: PortIdentity | None = None,
    list_fn: ListFn | None = None,
    path_exists: Callable[[str], bool] = os.path.exists,
) -> PortIdentity:
    """Return the single port matching *selector* (and *previous* identity, if known)."""
    sel = selector if isinstance(selector, Selector) else parse_selector(selector)
    ports = enumerate_ports(list_fn)

    if previous is not None and (previous.vid is not None or previous.by_id):
        same = [p for p in ports if previous.same_hardware(p)]
        if len(same) == 1:
            return same[0]
        if previous.by_id and path_exists(previous.by_id):
            return _explicit_path_identity(previous.by_id, ports)

    if sel.kind == "path" and _foreign_platform_path(sel.value):
        sel = Selector("auto")

    if sel.kind == "path":
        if path_exists(sel.value) or any(p.device == sel.value for p in ports):
            return _explicit_path_identity(sel.value, ports)
        msg = f"serial port {sel.value!r} is not present"
        raise DiscoveryError(msg, [p for p in ports if p.is_known_adapter])

    if sel.kind == "serial":
        matches = [p for p in ports if p.serial_number == sel.serial_number]
    elif sel.kind == "vidpid":
        matches = [
            p
            for p in ports
            if p.vid == sel.vid
            and p.pid == sel.pid
            and (sel.serial_number is None or p.serial_number == sel.serial_number)
        ]
    else:
        matches = [p for p in ports if p.is_known_adapter]

    if len(matches) == 1:
        return matches[0]
    if not matches:
        msg = f"no serial port matches selector {sel}"
        raise DiscoveryError(msg, [p for p in ports if p.is_known_adapter] or ports)
    msg = (
        f"{len(matches)} serial ports match selector {sel}; set GATEWAY_LINK__SELECTOR "
        "to a VID:PID:SERIAL, sn:SERIAL or /dev/serial/by-id path"
    )
    raise DiscoveryError(msg, matches)
