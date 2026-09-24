"""Async serial link with hotplug recovery and Arduino auto-reset handling.

Design:

* pyserial runs in ONE daemon reader thread per open port; received chunks are handed to the
  event loop through an asyncio queue. Writes run in a worker thread under a lock.
* A supervisor task owns the lifecycle: discover -> open (exclusive where supported) -> apply the
  reset policy -> CONNECTED -> wait for loss -> close -> back off -> rediscover by identity.
* Loss is detected by the reader thread (``SerialException``/``OSError`` on unplug) and by a
  presence watchdog (device node gone). Backoff is capped exponential, 0.25 s -> 5 s, and only
  resets after the link stayed up for ``stable_after_s``: the link can never reopen in a tight loop.
* Reset policies (Arduino Uno/Nano/Mega reset when DTR is asserted on open):

  ``hold_dtr_low``   DTR/RTS are configured low before ``open()`` (no reset on most drivers).
                     The stream is joined mid-flight, so ``aligned`` is False.
  ``wait_for_reset`` open normally (board resets), then discard boot noise for
                     ``reset_settle_ms`` (default 2000). If ``ready_banner`` (regex) is seen first,
                     the link is ready immediately and the stream is line-aligned.
"""

from __future__ import annotations

import asyncio
import contextlib
import os
import re
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field, replace
from enum import StrEnum
from typing import Any

import serial
import structlog

from gateway.transport.discovery import (
    DiscoveryError,
    ListFn,
    PortIdentity,
    parse_selector,
    resolve,
)

log = structlog.get_logger()


class ResetPolicy(StrEnum):
    HOLD_DTR_LOW = "hold_dtr_low"
    WAIT_FOR_RESET = "wait_for_reset"


class LinkStateKind(StrEnum):
    IDLE = "idle"
    CONNECTING = "connecting"
    RESETTING = "resetting"
    CONNECTED = "connected"
    BACKOFF = "backoff"
    STOPPED = "stopped"


@dataclass(frozen=True, slots=True)
class LinkState:
    state: LinkStateKind
    port: str | None = None
    reconnect_count: int = 0
    last_error: str | None = None
    generation: int = 0

    def as_dict(self) -> dict[str, Any]:
        return {
            "state": self.state.value,
            "port": self.port,
            "reconnect_count": self.reconnect_count,
            "last_error": self.last_error,
            "generation": self.generation,
        }


@dataclass(slots=True)
class LinkConfig:
    selector: str | None = None
    baudrate: int = 115200
    bytesize: int = 8
    parity: str = "N"
    stopbits: float = 1
    reset_policy: ResetPolicy | str = ResetPolicy.HOLD_DTR_LOW
    reset_settle_ms: int = 2000
    ready_banner: str | None = None
    ready_timeout_ms: int = 0
    backoff_min_s: float = 0.25
    backoff_max_s: float = 5.0
    stable_after_s: float = 5.0
    read_timeout_s: float = 0.05
    presence_check_s: float = 0.5
    exclusive: bool = True
    name: str = "serial"
    max_queued_chunks: int = 4096


class LinkDown(ConnectionError):
    """The link is not connected (or went down while waiting)."""


@dataclass(slots=True)
class LinkStats:
    rx_bytes: int = 0
    tx_bytes: int = 0
    rx_overruns: int = 0
    opens: int = 0
    open_failures: int = 0
    banner_seen: int = 0
    banner_missing: int = 0

    def as_dict(self) -> dict[str, int]:
        return {k: getattr(self, k) for k in self.__slots__}  # type: ignore[attr-defined]


# Ports currently held open by a link in this process (realpath -> link name). Used by the
# commissioning probe so it never opens a live port a second time.
_HELD: dict[str, str] = {}
_HELD_LOCK = threading.Lock()


def _key(port: str) -> str:
    return os.path.realpath(port) if os.name == "posix" else port.upper()


def held_ports() -> dict[str, str]:
    with _HELD_LOCK:
        return dict(_HELD)


def is_port_held(port: str) -> str | None:
    """Return the owning link name if *port* is held open by this gateway, else None."""
    with _HELD_LOCK:
        return _HELD.get(_key(port))


StateListener = Callable[[LinkState], None]


@dataclass(slots=True)
class _Session:
    ser: Any
    generation: int
    stop: threading.Event = field(default_factory=threading.Event)
    thread: threading.Thread | None = None


class SerialLink:
    def __init__(
        self,
        config: LinkConfig,
        *,
        serial_factory: Callable[[], Any] | None = None,
        list_fn: ListFn | None = None,
        on_state: StateListener | None = None,
    ) -> None:
        self.config = config
        self._policy = ResetPolicy(config.reset_policy)
        self._banner = re.compile(config.ready_banner) if config.ready_banner else None
        self._selector = parse_selector(config.selector)
        self._serial_factory = serial_factory or serial.Serial
        self._list_fn = list_fn
        self._listeners: list[StateListener] = [on_state] if on_state else []
        self._state = LinkState(LinkStateKind.IDLE)
        self._identity: PortIdentity | None = None
        self._session: _Session | None = None
        self._queue: asyncio.Queue[tuple[int, bytes | None]] = asyncio.Queue()
        self._connected_evt = asyncio.Event()
        self._down_evt = asyncio.Event()
        self._down_reason: str | None = None
        self._write_lock = asyncio.Lock()
        self._task: asyncio.Task[None] | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._stopping = False
        self.aligned = False
        self.stats = LinkStats()
        self.last_connected_monotonic: float | None = None

    # ------------------------------------------------------------------ public API
    @property
    def state(self) -> LinkState:
        return self._state

    @property
    def identity(self) -> PortIdentity | None:
        return self._identity

    @property
    def connected(self) -> bool:
        return self._state.state is LinkStateKind.CONNECTED

    @property
    def generation(self) -> int:
        return self._state.generation

    def add_listener(self, listener: StateListener) -> None:
        self._listeners.append(listener)

    def snapshot(self) -> dict[str, Any]:
        return {
            "name": self.config.name,
            **self._state.as_dict(),
            "selector": str(self._selector),
            "reset_policy": self._policy.value,
            "identity": self._identity.as_dict() if self._identity else None,
            **self.stats.as_dict(),
        }

    async def start(self) -> None:
        if self._task is None:
            self._loop = asyncio.get_running_loop()
            self._stopping = False
            self._task = asyncio.create_task(self._supervise(), name=f"serial-link-{self.config.name}")

    async def stop(self) -> None:
        self._stopping = True
        self._down_reason = self._down_reason or "stopped"
        self._down_evt.set()
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None
        await self._teardown()
        self._set_state(replace(self._state, state=LinkStateKind.STOPPED))

    async def __aenter__(self) -> SerialLink:
        await self.start()
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.stop()

    async def wait_connected(self, timeout: float | None = None) -> bool:
        try:
            await asyncio.wait_for(self._connected_evt.wait(), timeout)
        except TimeoutError:
            return False
        return True

    async def read(self, timeout: float) -> bytes:
        """Return the next received chunk, ``b""`` on timeout; raise LinkDown if disconnected."""
        if not self.connected:
            raise LinkDown(self._state.last_error or "link not connected")
        gen = self.generation
        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return b""
            try:
                chunk_gen, data = await asyncio.wait_for(self._queue.get(), remaining)
            except TimeoutError:
                return b""
            if data is None:
                if chunk_gen >= gen:
                    raise LinkDown(self._state.last_error or "link lost")
                continue
            if chunk_gen == gen:
                return data

    def discard_input(self) -> int:
        """Drop everything received but not yet read. Returns bytes discarded."""
        dropped = 0
        while True:
            try:
                gen, data = self._queue.get_nowait()
            except asyncio.QueueEmpty:
                return dropped
            if data is None:
                # Keep the link-down sentinel for the next reader.
                self._queue.put_nowait((gen, data))
                return dropped
            dropped += len(data)

    async def write(self, data: bytes) -> None:
        session = self._session
        if session is None or not self.connected:
            raise LinkDown(self._state.last_error or "link not connected")
        async with self._write_lock:
            try:
                await asyncio.to_thread(self._write_blocking, session.ser, data)
            except Exception as exc:
                self._signal_down(session.generation, exc)
                raise LinkDown(f"write failed: {exc}") from exc
        self.stats.tx_bytes += len(data)

    # ------------------------------------------------------------------ internals
    def _set_state(self, state: LinkState) -> None:
        self._state = state
        if state.state is LinkStateKind.CONNECTED:
            self._connected_evt.set()
        else:
            self._connected_evt.clear()
        for listener in list(self._listeners):
            try:
                listener(state)
            except Exception:  # listener bugs never take the link down
                log.exception("link_state_listener_failed", link=self.config.name)

    def _update(self, **changes: Any) -> None:
        self._set_state(replace(self._state, **changes))

    @staticmethod
    def _write_blocking(ser: Any, data: bytes) -> None:
        ser.write(data)
        ser.flush()

    def _open_blocking(self, identity: PortIdentity) -> Any:
        cfg = self.config
        ser = self._serial_factory()
        ser.port = identity.device
        ser.baudrate = cfg.baudrate
        ser.bytesize = cfg.bytesize
        ser.parity = cfg.parity
        ser.stopbits = cfg.stopbits
        ser.timeout = cfg.read_timeout_s
        ser.write_timeout = 1.0
        if self._policy is ResetPolicy.HOLD_DTR_LOW:
            # Applied by pyserial right after open(); prevents the DTR-edge auto-reset on most
            # drivers. (Linux raises DTR for a few µs inside open(); see README.)
            ser.dtr = False
            ser.rts = False
        if cfg.exclusive and os.name == "posix":
            ser.exclusive = True
        ser.open()
        return ser

    def _settle_blocking(self, ser: Any) -> bytes:
        """Apply wait_for_reset: discard boot noise, return bytes after a ready banner."""
        cfg = self.config
        start = time.monotonic()
        settle_deadline = start + cfg.reset_settle_ms / 1000.0
        banner_deadline = settle_deadline + (cfg.ready_timeout_ms / 1000.0 if self._banner else 0)
        buf = bytearray()
        while True:
            now = time.monotonic()
            if now >= banner_deadline:
                break
            data = ser.read(ser.in_waiting or 1)
            if not data or self._banner is None:
                continue
            buf += data
            while b"\n" in buf:
                line, _, rest = bytes(buf).partition(b"\n")
                buf = bytearray(rest)
                text = line.decode("utf-8", errors="replace").strip()
                if self._banner.search(text):
                    self.stats.banner_seen += 1
                    self.aligned = True
                    return bytes(buf)
            if len(buf) > 4096:
                buf = buf[-512:]
        if self._banner is not None:
            self.stats.banner_missing += 1
            log.warning("serial_ready_banner_missing", link=cfg.name, pattern=self._banner.pattern)
        ser.reset_input_buffer()
        self.aligned = False
        return b""

    def _reader_thread(self, session: _Session) -> None:
        ser = session.ser
        try:
            while not session.stop.is_set():
                data = ser.read(ser.in_waiting or 1)
                if data and not session.stop.is_set():
                    self._call_soon(self._enqueue, session.generation, data)
        except Exception as exc:
            if not session.stop.is_set():
                self._call_soon(self._signal_down, session.generation, exc)

    def _call_soon(self, fn: Callable[..., None], *args: Any) -> None:
        loop = self._loop
        if loop is None:
            return
        with contextlib.suppress(RuntimeError):  # loop already closed during shutdown
            loop.call_soon_threadsafe(fn, *args)

    def _enqueue(self, gen: int, data: bytes) -> None:
        if gen != self.generation:
            return
        self.stats.rx_bytes += len(data)
        if self._queue.qsize() >= self.config.max_queued_chunks:
            with contextlib.suppress(asyncio.QueueEmpty):
                self._queue.get_nowait()
            self.stats.rx_overruns += 1
        self._queue.put_nowait((gen, data))

    def _signal_down(self, gen: int, exc: BaseException | str) -> None:
        if gen != self.generation or self._down_evt.is_set():
            return
        self._down_reason = exc if isinstance(exc, str) else f"{type(exc).__name__}: {exc}"
        self._down_evt.set()

    async def _presence_watchdog(self, session: _Session, device: str) -> None:
        while True:
            await asyncio.sleep(self.config.presence_check_s)
            exists = await asyncio.to_thread(os.path.exists, device)
            if not exists:
                self._signal_down(session.generation, f"device {device} disappeared")
                return

    async def _teardown(self) -> None:
        session = self._session
        self._session = None
        if session is None:
            return
        session.stop.set()
        self._queue.put_nowait((session.generation, None))
        with _HELD_LOCK:
            for key, owner in list(_HELD.items()):
                if owner == self.config.name:
                    _HELD.pop(key, None)
        with contextlib.suppress(Exception):
            session.ser.cancel_read()
        if session.thread is not None:
            await asyncio.to_thread(session.thread.join, 2.0)
        with contextlib.suppress(Exception):
            await asyncio.to_thread(session.ser.close)

    async def _supervise(self) -> None:
        cfg = self.config
        backoff = cfg.backoff_min_s
        reconnects = 0
        while not self._stopping:
            self._update(state=LinkStateKind.CONNECTING)
            try:
                identity = await asyncio.to_thread(
                    resolve, self._selector, previous=self._identity, list_fn=self._list_fn
                )
                ser = await asyncio.to_thread(self._open_blocking, identity)
            except (DiscoveryError, serial.SerialException, OSError, ValueError) as exc:
                self.stats.open_failures += 1
                err = f"{type(exc).__name__}: {exc}"
                log.warning("serial_link_open_failed", link=cfg.name, error=err, retry_s=backoff)
                self._update(state=LinkStateKind.BACKOFF, last_error=err)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, cfg.backoff_max_s)
                continue

            leftover = b""
            self.aligned = False
            if self._policy is ResetPolicy.WAIT_FOR_RESET:
                self._update(state=LinkStateKind.RESETTING, port=identity.device)
                try:
                    leftover = await asyncio.to_thread(self._settle_blocking, ser)
                except Exception as exc:
                    with contextlib.suppress(Exception):
                        ser.close()
                    err = f"{type(exc).__name__}: {exc}"
                    self._update(state=LinkStateKind.BACKOFF, last_error=err)
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * 2, cfg.backoff_max_s)
                    continue

            if self._identity is None or identity.vid is not None or identity.by_id:
                self._identity = identity
            self.stats.opens += 1
            generation = self._state.generation + 1
            session = _Session(ser=ser, generation=generation)
            self._session = session
            with _HELD_LOCK:
                _HELD[_key(identity.device)] = cfg.name
            self._down_evt.clear()
            self._down_reason = None
            # drop anything from the previous generation
            while not self._queue.empty():
                self._queue.get_nowait()
            self._update(
                state=LinkStateKind.CONNECTED,
                port=identity.device,
                generation=generation,
                reconnect_count=reconnects,
                last_error=None,
            )
            connected_at = time.monotonic()
            self.last_connected_monotonic = connected_at
            log.info("serial_link_connected", link=cfg.name, port=identity.device, generation=generation)
            session.thread = threading.Thread(
                target=self._reader_thread, args=(session,), name=f"serial-rx-{cfg.name}", daemon=True
            )
            session.thread.start()
            if leftover:
                self._enqueue(generation, leftover)
            watchdog = asyncio.create_task(self._presence_watchdog(session, identity.device))
            try:
                await self._down_evt.wait()
            finally:
                watchdog.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await watchdog
            reason = self._down_reason or "link lost"
            await self._teardown()
            if self._stopping:
                break
            reconnects += 1
            if time.monotonic() - connected_at >= cfg.stable_after_s:
                backoff = cfg.backoff_min_s
            log.warning("serial_link_lost", link=cfg.name, error=reason, retry_s=backoff)
            self._update(state=LinkStateKind.BACKOFF, last_error=reason, reconnect_count=reconnects)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, cfg.backoff_max_s)
