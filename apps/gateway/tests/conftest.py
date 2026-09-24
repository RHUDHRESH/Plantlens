"""Shared fixtures: pty-backed mock serial devices and a non-daemon thread leak check."""

from __future__ import annotations

import logging
import os
import select
import threading
import time
import tty
from collections.abc import Callable, Iterator
from pathlib import Path

import pytest

logging.getLogger("pymodbus").setLevel(logging.CRITICAL)

_IGNORED_THREAD_PREFIXES = ("asyncio_", "ThreadPoolExecutor")


def _non_daemon_threads() -> set[threading.Thread]:
    return {
        t
        for t in threading.enumerate()
        if t is not threading.main_thread() and not t.daemon and t.is_alive()
    }


@pytest.fixture(autouse=True)
def isolated_machine_config(tmp_path_factory: pytest.TempPathFactory, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Never let a developer's real per-machine gateway config (setup wizard) leak into tests."""
    path = tmp_path_factory.mktemp("machine-config") / "gateway.env"
    monkeypatch.setenv("PLANTLENS_GATEWAY_CONFIG", str(path))
    monkeypatch.delenv("PLANTLENS_GATEWAY_PROFILE", raising=False)
    return path


@pytest.fixture(autouse=True)
def no_leaked_non_daemon_threads() -> Iterator[None]:
    """Fail a test that leaves a non-daemon thread behind (it would hang interpreter exit)."""
    before = _non_daemon_threads()
    yield
    deadline = time.monotonic() + 2.0
    leaked: set[threading.Thread] = set()
    while time.monotonic() < deadline:
        leaked = {
            t
            for t in _non_daemon_threads() - before
            if not t.name.startswith(_IGNORED_THREAD_PREFIXES)
        }
        if not leaked:
            return
        time.sleep(0.05)
    pytest.fail(f"leaked non-daemon threads: {sorted(t.name for t in leaked)}")


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    deadline = time.monotonic() + 3.0
    while time.monotonic() < deadline:
        leftovers = [t for t in _non_daemon_threads() if not t.name.startswith("asyncio_")]
        if not leftovers:
            return
        time.sleep(0.05)
    names = sorted(t.name for t in _non_daemon_threads())
    if names:
        session.exitstatus = 1
        print(f"\nERROR: non-daemon threads still alive at session end: {names}")


class PtyDevice:
    """A fake USB-serial device: the gateway opens ``path`` (a stable symlink), tests drive ``master``.

    ``unplug()`` closes the pty (reads on the gateway side fail with EIO, like a USB unplug) and
    ``replug()`` creates a NEW pty and re-points the symlink, like a device that re-enumerates.
    """

    def __init__(self, path: Path) -> None:
        self.path = path
        self.master: int | None = None
        self._slave: int | None = None
        self.plug()

    @property
    def slave_name(self) -> str:
        assert self._slave is not None
        return os.ttyname(self._slave)

    def plug(self) -> None:
        master, slave = os.openpty()
        tty.setraw(slave)
        tty.setraw(master)
        self.master, self._slave = master, slave
        if self.path.is_symlink() or self.path.exists():
            self.path.unlink()
        self.path.symlink_to(os.ttyname(slave))

    def write(self, data: bytes | str) -> None:
        assert self.master is not None, "device unplugged"
        os.write(self.master, data.encode() if isinstance(data, str) else data)

    def read_available(self, timeout: float = 0.2) -> bytes:
        assert self.master is not None
        out = b""
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            ready, _, _ = select.select([self.master], [], [], 0.02)
            if ready:
                try:
                    out += os.read(self.master, 4096)
                except OSError:
                    break
            elif out:
                break
        return out

    def unplug(self) -> None:
        for fd in (self.master, self._slave):
            if fd is not None:
                try:
                    os.close(fd)
                except OSError:
                    pass
        self.master = self._slave = None

    def replug(self) -> None:
        self.unplug()
        self.plug()


@pytest.fixture
def pty_device(tmp_path: Path) -> Iterator[PtyDevice]:
    dev = PtyDevice(tmp_path / "ttyFAKE0")
    yield dev
    dev.unplug()


class PtyBus:
    """Two ptys joined by a relay thread: a null-modem 'RS-485 bus' for RTU tests.

    ``drop_request`` lets a test make a unit silent (its requests never reach the slave).
    """

    def __init__(self, tmp_path: Path, drop_request: Callable[[bytes], bool] | None = None) -> None:
        self.a = PtyDevice(tmp_path / "busA")  # slave side (pymodbus server)
        self.b = PtyDevice(tmp_path / "busB")  # master side (gateway)
        self.drop_request = drop_request
        self.dropped = 0
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._relay, name="pty-bus-relay", daemon=True)
        self._thread.start()

    def _relay(self) -> None:
        a, b = self.a.master, self.b.master
        assert a is not None and b is not None
        while not self._stop.is_set():
            try:
                ready, _, _ = select.select([a, b], [], [], 0.05)
            except (OSError, ValueError):
                return
            for fd in ready:
                try:
                    data = os.read(fd, 4096)
                except OSError:
                    continue
                if fd == b:
                    if self.drop_request is not None and data and self.drop_request(data):
                        self.dropped += 1
                        continue
                    os.write(a, data)
                else:
                    os.write(b, data)

    def close(self) -> None:
        self._stop.set()
        self._thread.join(1.0)
        self.a.unplug()
        self.b.unplug()


@pytest.fixture
def pty_bus_factory(tmp_path: Path) -> Iterator[Callable[..., PtyBus]]:
    buses: list[PtyBus] = []

    def make(drop_request: Callable[[bytes], bool] | None = None) -> PtyBus:
        bus = PtyBus(tmp_path, drop_request)
        buses.append(bus)
        return bus

    yield make
    for bus in buses:
        bus.close()
