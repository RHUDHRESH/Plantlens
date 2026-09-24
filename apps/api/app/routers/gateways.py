"""Multi-gateway connection registry — heartbeats in, a status list out (read-only, rule R7).

Every gateway PC posts a compact heartbeat every few seconds with the ingest token. The API keeps
the latest heartbeat per ``gateway_id`` in memory (bounded) and serves a list with a computed
``online`` / ``stale`` / ``offline`` status plus the live tags that gateway has delivered.
Nothing here probes, configures or writes to hardware.
"""

from __future__ import annotations

import time
from collections import OrderedDict
from datetime import UTC, datetime
from threading import Lock
from typing import Any, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field

from app.auth.dependencies import require_viewer
from app.auth.principal import Principal
from app.routers.ingest import verify_gateway_ingest_token
from app.runtime.runtime_state import runtime_state

router = APIRouter(prefix="/api/gateways", tags=["gateways"])

MAX_GATEWAYS = 64
ONLINE_WITHIN_S = 15.0
STALE_WITHIN_S = 60.0
MAX_TAGS_PER_GATEWAY = 200

GatewayStatus = Literal["online", "stale", "offline"]


class _Loose(BaseModel):
    # Gateways of different versions may add fields; keep what we know, ignore the rest.
    model_config = ConfigDict(extra="ignore")


class HeartbeatLink(_Loose):
    name: str | None = Field(default=None, max_length=128)
    state: str = Field(default="unknown", max_length=32)
    device: str | None = Field(default=None, max_length=256)
    selector: str | None = Field(default=None, max_length=256)
    vid: str | None = Field(default=None, max_length=8)
    pid: str | None = Field(default=None, max_length=8)
    serial_number: str | None = Field(default=None, max_length=128)
    description: str | None = Field(default=None, max_length=256)
    adapter: str | None = Field(default=None, max_length=128)
    baudrate: int | None = None
    reconnect_count: int = 0
    last_error: str | None = Field(default=None, max_length=512)


class HeartbeatCounters(_Loose):
    frames_published: int = 0
    frames_per_s: float = 0.0
    stale_tags: int = 0
    modbus_requests: int | None = None
    modbus_timeouts: int | None = None
    modbus_crc_errors: int | None = None
    line_accepted: int | None = None
    line_rejected: int | None = None
    line_checksum_failures: int | None = None


class HeartbeatUplink(_Loose):
    queue_depth: int = 0
    dropped: int = 0
    quarantined: int = 0
    last_status: int | None = None
    last_error: str | None = Field(default=None, max_length=512)


class GatewayHeartbeat(_Loose):
    gateway_id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.:-]+$")
    hostname: str = Field(default="", max_length=128)
    os: str = Field(default="", max_length=128)
    version: str = Field(default="", max_length=32)
    mode: str = Field(default="modbus", max_length=32)
    links: list[HeartbeatLink] = Field(default_factory=list, max_length=16)
    counters: HeartbeatCounters = Field(default_factory=HeartbeatCounters)
    uplink: HeartbeatUplink = Field(default_factory=HeartbeatUplink)
    started_at: datetime | None = None
    health_port: int | None = None
    ips: list[str] = Field(default_factory=list, max_length=16)


class _Entry:
    __slots__ = ("heartbeat", "received_at", "received_mono", "remote_addr", "first_seen_at")

    def __init__(self, heartbeat: GatewayHeartbeat, remote_addr: str | None, first_seen_at: datetime) -> None:
        self.heartbeat = heartbeat
        self.received_at = datetime.now(UTC)
        self.received_mono = time.monotonic()
        self.remote_addr = remote_addr
        self.first_seen_at = first_seen_at


class GatewayRegistry:
    """Latest heartbeat per gateway; least-recently-heard entries are evicted past ``max_gateways``."""

    def __init__(self, max_gateways: int = MAX_GATEWAYS) -> None:
        self.max_gateways = max_gateways
        self._entries: OrderedDict[str, _Entry] = OrderedDict()
        self._lock = Lock()

    def record(self, heartbeat: GatewayHeartbeat, remote_addr: str | None) -> _Entry:
        with self._lock:
            previous = self._entries.pop(heartbeat.gateway_id, None)
            first_seen = previous.first_seen_at if previous else datetime.now(UTC)
            entry = _Entry(heartbeat, remote_addr, first_seen)
            self._entries[heartbeat.gateway_id] = entry
            while len(self._entries) > self.max_gateways:
                self._entries.popitem(last=False)
            return entry

    def entries(self) -> list[_Entry]:
        with self._lock:
            return list(self._entries.values())

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()


registry = GatewayRegistry()


def _iso(ts: datetime | None) -> str | None:
    return ts.isoformat().replace("+00:00", "Z") if ts else None


def status_for_age(age_s: float) -> GatewayStatus:
    if age_s < ONLINE_WITHIN_S:
        return "online"
    if age_s < STALE_WITHIN_S:
        return "stale"
    return "offline"


def _frames_by_gateway() -> dict[str, list[Any]]:
    grouped: dict[str, list[Any]] = {}
    for frame in list(runtime_state.tags.values()):
        if frame.gateway_id and frame.source != "simulator":
            grouped.setdefault(frame.gateway_id, []).append(frame)
    return grouped


def _tag_rows(frames: list[Any]) -> tuple[list[dict[str, Any]], datetime | None]:
    rows: list[dict[str, Any]] = []
    last: datetime | None = None
    for frame in sorted(frames, key=lambda f: f.tag_id)[:MAX_TAGS_PER_GATEWAY]:
        received = frame.ingest_ts or frame.timestamp
        if last is None or received > last:
            last = received
        rows.append(
            {
                "tag_id": frame.tag_id,
                "asset_id": frame.asset_id,
                "value": frame.value,
                "unit": frame.unit,
                "quality": frame.quality,
                "source": frame.source,
                "received_at": _iso(received),
            }
        )
    return rows, last


def _describe(entry: _Entry | None, gateway_id: str, frames: list[Any], now_mono: float) -> dict[str, Any]:
    tags, last_frame = _tag_rows(frames)
    assets = sorted({row["asset_id"] for row in tags})
    if entry is None:
        # Frames arrive but no heartbeat (older gateway build): report what the data shows.
        return {
            "gateway_id": gateway_id,
            "status": "unknown",
            "heartbeat_age_s": None,
            "received_at": None,
            "first_seen_at": None,
            "remote_addr": None,
            "heartbeat": None,
            "last_frame_at": _iso(last_frame),
            "tag_count": len(tags),
            "assets": assets,
            "tags": tags,
        }
    age = max(0.0, now_mono - entry.received_mono)
    return {
        "gateway_id": gateway_id,
        "status": status_for_age(age),
        "heartbeat_age_s": round(age, 1),
        "received_at": _iso(entry.received_at),
        "first_seen_at": _iso(entry.first_seen_at),
        "remote_addr": entry.remote_addr,
        "heartbeat": entry.heartbeat.model_dump(mode="json"),
        "last_frame_at": _iso(last_frame),
        "tag_count": len(tags),
        "assets": assets,
        "tags": tags,
    }


@router.post("/heartbeat")
async def post_heartbeat(
    heartbeat: GatewayHeartbeat,
    request: Request,
    _: None = Depends(verify_gateway_ingest_token),
) -> dict[str, Any]:
    remote = request.client.host if request.client else None
    entry = registry.record(heartbeat, remote)
    return {"status": "ok", "gateway_id": heartbeat.gateway_id, "received_at": _iso(entry.received_at)}


@router.get("")
async def list_gateways(_principal: Principal = Depends(require_viewer)) -> dict[str, Any]:
    now_mono = time.monotonic()
    frames = _frames_by_gateway()
    entries = {e.heartbeat.gateway_id: e for e in registry.entries()}
    ids = sorted(set(entries) | set(frames))
    gateways = [_describe(entries.get(gid), gid, frames.get(gid, []), now_mono) for gid in ids]
    order = {"online": 0, "stale": 1, "unknown": 2, "offline": 3}
    gateways.sort(key=lambda g: (order.get(g["status"], 9), g["gateway_id"]))
    return {
        "checked_at": _iso(datetime.now(UTC)),
        "online_within_s": ONLINE_WITHIN_S,
        "stale_within_s": STALE_WITHIN_S,
        "gateways": gateways,
    }
