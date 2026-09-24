"""Gateway entrypoint — read-only acquisition (rule R7).

Modes (``GATEWAY_SERIAL_MODE``):

* ``modbus`` / ``modbus_rtu`` / ``modbus_tcp`` (default): a ScanEngine device for EVERY Modbus
  source in the tag map (RTU and TCP), each stamped with its own ``source``.
* ``line``: a text device (e.g. Arduino Uno over USB) through SerialLink + LineReader. Line mode
  needs no Modbus source in the tag map.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import signal
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import structlog

from gateway.health import start_health_server
from gateway.line.protocols import LineDecoder
from gateway.line.reader import LineReader
from gateway.modbus.batch_planner import BatchPlanner, PlannerLimits, SourceSpec, tags_from_tag_map
from gateway.modbus.guard import ReadOnlyGuard
from gateway.modbus.scan_engine import ScanEngine, ScanTiming
from gateway.modbus.transports import RtuTransport, TcpTransport
from gateway.publish.uplink import Uplink
from gateway.raw_serial_reader import build_line_tag_index
from gateway.settings import Settings, get_settings, resolve_tag_map_path
from gateway.tag_frame import TagFrame
from gateway.transport.serial_link import LinkConfig, ResetPolicy, SerialLink

log = structlog.get_logger()


@dataclass
class GatewayRuntime:
    """Everything /health reports on; also what shutdown closes."""

    uplink: Uplink | None = None
    engine: ScanEngine | None = None
    line: LineReader | None = None
    links: list[SerialLink] = field(default_factory=list)
    tcp: list[TcpTransport] = field(default_factory=list)
    mode: str = "modbus"

    def snapshot(self) -> dict[str, Any]:
        body: dict[str, Any] = {"mode": self.mode}
        last_good: datetime | None = None
        error_count = crc = reconnects = stale = 0
        if self.engine is not None:
            modbus = self.engine.snapshot()
            body["modbus"] = modbus
            for d in self.engine.devices:
                diag = d.diag
                error_count += diag.error_count
                crc += diag.crc_errors
                reconnects += diag.reconnects
                stale += len(diag.stale_tags)
                if diag.last_good_read_ts and (last_good is None or diag.last_good_read_ts > last_good):
                    last_good = diag.last_good_read_ts
        if self.line is not None:
            line = self.line.snapshot()
            body["line"] = line
            error_count += self.line.decoder.stats.rejected_lines
            crc += self.line.decoder.stats.checksum_failures
            stale += len(self.line.stale_tags)
            last_good = self.line.last_good_read_ts or last_good
        reconnects += sum(link.state.reconnect_count for link in self.links)
        body["links"] = [link.snapshot() for link in self.links]
        if self.uplink is not None:
            body["uplink"] = self.uplink.snapshot()
        body.update(
            {
                "last_good_read_ts": last_good.isoformat().replace("+00:00", "Z") if last_good else None,
                "error_count": error_count,
                "crc_failures": crc,
                "reconnect_count": reconnects,
                "stale_tag_count": stale,
            }
        )
        return body


def _link_config(settings: Settings, serial_cfg: dict[str, Any], *, name: str, default_policy: ResetPolicy, default_baud: int) -> LinkConfig:
    ls = settings.link
    return LinkConfig(
        selector=settings.link_selector(serial_cfg.get("selector") or serial_cfg.get("port")),
        baudrate=settings.serial_baudrate or ls.baudrate or int(serial_cfg.get("baudrate", default_baud)),
        bytesize=int(serial_cfg.get("bytesize", ls.bytesize)),
        parity=ls.parity or str(serial_cfg.get("parity", "N")),
        stopbits=ls.stopbits or float(serial_cfg.get("stopbits", 1)),
        reset_policy=ls.reset_policy or serial_cfg.get("reset_policy") or default_policy,
        reset_settle_ms=ls.reset_settle_ms,
        ready_banner=ls.ready_banner,
        ready_timeout_ms=ls.ready_timeout_ms,
        backoff_min_s=ls.backoff_min_ms / 1000.0,
        backoff_max_s=ls.backoff_max_ms / 1000.0,
        exclusive=ls.exclusive,
        name=name,
    )


def build_scan_engine(
    settings: Settings,
    tag_map: dict[str, Any],
    publish: Any,
    runtime: GatewayRuntime,
) -> ScanEngine:
    ms = settings.modbus
    engine = ScanEngine(
        gateway_id=settings.gateway_id,
        publish=publish,
        timing=ScanTiming(
            timeout_s=ms.timeout_ms / 1000.0,
            retries=ms.retries,
            inter_request_s=(ms.inter_request_ms or 0.0) / 1000.0,
            backoff_min_s=ms.backoff_min_ms / 1000.0,
            backoff_max_s=ms.backoff_max_ms / 1000.0,
        ),
    )
    limits = PlannerLimits(max_gap=ms.max_gap, max_registers=ms.max_registers, max_bits=ms.max_bits)
    sources, per_source = tags_from_tag_map(tag_map)
    rtu_buses: dict[tuple[Any, ...], RtuTransport] = {}
    tcp_hosts: dict[tuple[str, int], TcpTransport] = {}
    for source_id, tags in per_source.items():
        if not tags:
            continue
        spec: SourceSpec = sources[source_id]
        if spec.protocol == "modbus_tcp":
            host = str(spec.raw.get("host", "127.0.0.1"))
            port = int(spec.raw.get("port", 502))
            transport = tcp_hosts.get((host, port))
            if transport is None:
                transport = tcp_hosts[(host, port)] = TcpTransport(host, port, connect_timeout=max(ms.timeout_ms / 1000.0, 0.5))
                runtime.tcp.append(transport)
            reconnects_fn = lambda t=transport: t.reconnects  # noqa: E731
            source_name = "modbus_tcp"
        else:
            cfg = _link_config(
                settings, spec.serial, name=f"rtu:{source_id}", default_policy=ResetPolicy.HOLD_DTR_LOW, default_baud=9600
            )
            key = (cfg.selector, cfg.baudrate, cfg.parity, cfg.stopbits, cfg.bytesize)
            rtu = rtu_buses.get(key)
            if rtu is None:
                link = SerialLink(cfg)
                runtime.links.append(link)
                inter = ms.inter_request_ms / 1000.0 if ms.inter_request_ms is not None else None
                rtu = rtu_buses[key] = RtuTransport(
                    link, baudrate=cfg.baudrate, inter_frame_s=inter, local_echo=settings.link.local_echo
                )
            transport = rtu
            reconnects_fn = lambda t=rtu: t.reconnects  # noqa: E731
            source_name = "modbus_rtu"
        engine.add_device(
            source_id=source_id,
            unit_id=spec.unit_id,
            source=source_name,  # type: ignore[arg-type]
            poll_ms=spec.poll_ms,
            tags=tags,
            guard=ReadOnlyGuard(transport),
            planner=BatchPlanner(source_id, spec.unit_id, tags, limits=limits),
            reconnects_fn=reconnects_fn,
        )
    runtime.engine = engine
    return engine


def build_line_reader(settings: Settings, tag_map: dict[str, Any], publish: Any, runtime: GatewayRuntime) -> LineReader:
    serial_cfg: dict[str, Any] = {}
    for src in tag_map.get("sources", []):
        if src.get("protocol") in {"serial_line", "line"}:
            serial_cfg = dict(src.get("serial", {}))
            break
    cfg = _link_config(settings, serial_cfg, name="line", default_policy=ResetPolicy.WAIT_FOR_RESET, default_baud=115200)
    link = SerialLink(cfg)
    runtime.links.append(link)
    tag_index = build_line_tag_index(tag_map, stale_after_ms=settings.line.stale_after_ms)
    decoder = LineDecoder(
        tag_index,
        protocol=settings.line.protocol,
        column_map=settings.line.column_map,
        default_tag_id=settings.line_default_tag_id,
        csv_header=settings.line.csv_header,
    )
    runtime.line = LineReader(
        link=link,
        decoder=decoder,
        gateway_id=settings.gateway_id,
        publish=publish,
        source=settings.line.source,
        max_line_bytes=settings.line.max_line_bytes,
    )
    return runtime.line


async def run(settings: Settings | None = None, *, stop: asyncio.Event | None = None) -> GatewayRuntime:
    settings = settings or get_settings()
    tag_map = json.loads(resolve_tag_map_path(settings).read_text(encoding="utf-8"))
    stop = stop or asyncio.Event()
    runtime = GatewayRuntime(mode="line" if settings.serial_mode == "line" else "modbus")
    us = settings.uplink
    uplink = Uplink(
        api_base=settings.api_base_url,
        token=settings.gateway_ingest_token,
        batch_max=us.batch_max,
        flush_interval_s=us.flush_ms / 1000.0,
        queue_max=us.queue_max,
        timeout_s=us.timeout_s,
    )
    runtime.uplink = uplink

    async def publish(frame: TagFrame) -> None:
        uplink.enqueue(frame)

    if runtime.mode == "line":
        runtime.line = build_line_reader(settings, tag_map, publish, runtime)
        work = runtime.line.run_forever()
    else:
        runtime.engine = build_scan_engine(settings, tag_map, publish, runtime)
        if not runtime.engine.devices:
            log.warning("no_modbus_sources_with_register_tags")
            return runtime
        for link in runtime.links:
            await link.start()
        log.info("scan_plan", requests_per_scan=runtime.engine.requests_per_scan(), devices=len(runtime.engine.devices))
        work = runtime.engine.run_forever()

    await uplink.start()
    server = start_health_server(settings.health_port, status_fn=runtime.snapshot)
    task = asyncio.create_task(work)
    stopper = asyncio.create_task(stop.wait())
    try:
        await asyncio.wait({task, stopper}, return_when=asyncio.FIRST_COMPLETED)
        if task.done() and not task.cancelled() and task.exception():
            log.error("gateway_worker_failed", error=repr(task.exception()))
    finally:
        for t in (task, stopper):
            t.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await t
        for link in runtime.links:
            await link.stop()
        for tcp in runtime.tcp:
            await tcp.close()
        await uplink.close()
        server.shutdown()
        server.server_close()
        log.info("gateway_stopped")
    return runtime


async def main() -> None:
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except (NotImplementedError, RuntimeError):  # Windows
            signal.signal(sig, lambda *_: loop.call_soon_threadsafe(stop.set))
    await run(stop=stop)


if __name__ == "__main__":
    asyncio.run(main())
