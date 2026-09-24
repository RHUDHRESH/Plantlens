"""Gateway heartbeat — tells the API "this PC, these ports, this much data" every few seconds.

* Independent of the frame uplink: its own HTTP client and task, so a stuck ingest queue never
  hides the heartbeat and a failed heartbeat never delays frames.
* Never raises into the gateway: every failure is logged, counted and backed off (capped).
* Read-only (rule R7): it only summarizes the same data ``/health`` already reports.
"""

from __future__ import annotations

import asyncio
import contextlib
import platform
import socket
import time
from collections.abc import Callable
from datetime import UTC, datetime
from importlib import metadata
from typing import Any
from urllib.parse import urlparse

import httpx
import structlog

log = structlog.get_logger()

SnapshotFn = Callable[[], dict[str, Any]]
_IP_REFRESH_S = 60.0


def gateway_version() -> str:
    try:
        return metadata.version("plantlens-gateway")
    except metadata.PackageNotFoundError:
        return "0.0.0"


def os_label() -> str:
    system = platform.system() or "unknown"
    release = platform.release()
    return f"{system} {release}".strip()


def local_ips(api_base: str | None = None) -> list[str]:
    """Best-effort non-loopback IPv4 addresses. Never raises; sends no packets."""
    found: list[str] = []
    host = urlparse(api_base or "").hostname
    if host:
        # A UDP "connect" only picks the route; the address used to reach the API comes first.
        with contextlib.suppress(OSError), socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect((host, 9))
            found.append(s.getsockname()[0])
    with contextlib.suppress(OSError):
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            found.append(str(info[4][0]))
    out: list[str] = []
    for ip in found:
        if ip and not ip.startswith("127.") and ip != "0.0.0.0" and ip not in out:
            out.append(ip)
    return out[:8]


def _link_summary(link: dict[str, Any]) -> dict[str, Any]:
    identity = link.get("identity") or {}
    return {
        "name": link.get("name"),
        "state": link.get("state") or "unknown",
        "device": identity.get("device") or link.get("port"),
        "selector": link.get("selector"),
        "vid": identity.get("vid"),
        "pid": identity.get("pid"),
        "serial_number": identity.get("serial_number"),
        "description": identity.get("description") or None,
        "adapter": identity.get("adapter"),
        "reconnect_count": int(link.get("reconnect_count") or 0),
        "last_error": link.get("last_error"),
    }


def summarize(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Compact heartbeat fields from a ``GatewayRuntime.snapshot()``-shaped dict."""
    counters: dict[str, Any] = {
        "frames_published": int(snapshot.get("frames_published") or 0),
        "stale_tags": int(snapshot.get("stale_tag_count") or 0),
    }
    modbus = snapshot.get("modbus")
    if isinstance(modbus, dict):
        devices = modbus.get("devices") or []
        counters["modbus_requests"] = sum(int(d.get("requests") or 0) for d in devices)
        counters["modbus_timeouts"] = sum(int(d.get("timeouts") or 0) for d in devices)
        counters["modbus_crc_errors"] = sum(int(d.get("crc_errors") or 0) for d in devices)
    line = snapshot.get("line")
    if isinstance(line, dict):
        decoder = line.get("decoder") or {}
        counters["line_accepted"] = int(decoder.get("accepted_lines") or 0)
        counters["line_rejected"] = int(decoder.get("rejected_lines") or 0)
        counters["line_checksum_failures"] = int(decoder.get("checksum_failures") or 0)
    uplink = snapshot.get("uplink") or {}
    return {
        "mode": snapshot.get("mode") or "modbus",
        "links": [_link_summary(link) for link in snapshot.get("links") or []],
        "counters": counters,
        "uplink": {
            "queue_depth": int(uplink.get("queue_depth") or 0),
            "dropped": int(uplink.get("dropped") or 0),
            "quarantined": int(uplink.get("quarantined") or 0),
            "last_status": uplink.get("last_status"),
            "last_error": uplink.get("last_error"),
        },
    }


class Heartbeat:
    def __init__(
        self,
        *,
        api_base: str,
        token: str,
        gateway_id: str,
        snapshot_fn: SnapshotFn,
        health_port: int | None = None,
        interval_s: float = 5.0,
        backoff_max_s: float = 60.0,
        timeout_s: float = 3.0,
        transport: httpx.AsyncBaseTransport | None = None,
        hostname: str | None = None,
    ) -> None:
        self._url = f"{api_base.rstrip('/')}/api/gateways/heartbeat"
        self._api_base = api_base
        self._headers = {"Authorization": f"Bearer {token}"}
        self.gateway_id = gateway_id
        self._snapshot_fn = snapshot_fn
        self.health_port = health_port
        self.interval_s = interval_s
        self.backoff_max_s = max(backoff_max_s, interval_s)
        self._timeout_s = timeout_s
        self._transport = transport
        self.hostname = hostname or socket.gethostname()
        self.os = os_label()
        self.version = gateway_version()
        self.started_at = datetime.now(UTC)
        self._client: httpx.AsyncClient | None = None
        self._task: asyncio.Task[None] | None = None
        self._ips: list[str] = []
        self._ips_at = 0.0
        self._last_rate: tuple[float, int] | None = None
        self.delay_s = interval_s
        self.sent = 0
        self.failures = 0
        self.last_status: int | None = None
        self.last_error: str | None = None

    def build_payload(self) -> dict[str, Any]:
        snapshot = self._snapshot_fn()
        body = summarize(snapshot)
        published = body["counters"]["frames_published"]
        now = time.monotonic()
        rate = 0.0
        if self._last_rate is not None:
            then, count = self._last_rate
            if now > then and published >= count:
                rate = (published - count) / (now - then)
        self._last_rate = (now, published)
        body["counters"]["frames_per_s"] = round(rate, 2)
        body.update(
            {
                "gateway_id": self.gateway_id,
                "hostname": self.hostname,
                "os": self.os,
                "version": self.version,
                "started_at": self.started_at.isoformat().replace("+00:00", "Z"),
                "health_port": self.health_port,
                "ips": self._ips,
            }
        )
        return body

    async def _refresh_ips(self) -> None:
        if self._ips and time.monotonic() - self._ips_at < _IP_REFRESH_S:
            return
        try:
            self._ips = await asyncio.to_thread(local_ips, self._api_base)
        except Exception:  # noqa: BLE001 — best effort, never fatal
            self._ips = []
        self._ips_at = time.monotonic()

    async def send_once(self) -> bool:
        """Post one heartbeat. Returns True on 2xx; never raises."""
        try:
            await self._refresh_ips()
            if self._client is None:
                self._client = httpx.AsyncClient(timeout=self._timeout_s, transport=self._transport)
            response = await self._client.post(self._url, json=self.build_payload(), headers=self._headers)
            self.last_status = response.status_code
            if response.is_success:
                self.sent += 1
                self.last_error = None
                self.delay_s = self.interval_s
                return True
            self.last_error = f"HTTP {response.status_code}: {response.text[:200]}"
        except Exception as exc:  # noqa: BLE001 — network errors, a bad snapshot: never crash the gateway
            self.last_error = f"{type(exc).__name__}: {exc}"
        self.failures += 1
        self.delay_s = min(self.delay_s * 2, self.backoff_max_s)
        log.warning("heartbeat_failed", error=self.last_error, retry_s=self.delay_s)
        return False

    async def _run(self) -> None:
        while True:
            await self.send_once()
            await asyncio.sleep(self.delay_s)

    async def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run(), name="heartbeat")

    async def close(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self._task
            self._task = None
        if self._client is not None:
            with contextlib.suppress(Exception):
                await self._client.aclose()
            self._client = None
