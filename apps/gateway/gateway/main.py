"""Gateway entrypoint — read-only Modbus poller."""

from __future__ import annotations

import asyncio
import json
import signal

import structlog

from gateway.health import start_health_server
from gateway.modbus_poller import ModbusPoller, build_poll_plan
from gateway.publish import FramePublisher
from gateway.serial_client import create_client
from gateway.settings import get_settings, resolve_tag_map_path

log = structlog.get_logger()


async def main() -> None:
    settings = get_settings()
    tag_map_path = resolve_tag_map_path(settings)
    tag_map = json.loads(tag_map_path.read_text(encoding="utf-8"))
    sources = {s["source_id"]: s for s in tag_map.get("sources", [])}
    modbus_sources = [
        sid for sid, src in sources.items() if src.get("protocol") in {"modbus_rtu", "modbus_tcp"}
    ]
    if not modbus_sources:
        log.warning("no_modbus_sources_in_tag_map")
        return

    source_id = modbus_sources[0]
    source = sources[source_id]
    plan = build_poll_plan(tag_map)
    if not plan:
        log.warning("empty_poll_plan")
        return

    publisher = FramePublisher(
        api_base=settings.api_base_url,
        token=settings.gateway_ingest_token,
    )
    await publisher.start()
    client = create_client(source)
    poller = ModbusPoller(
        client=client,
        gateway_id=settings.gateway_id,
        publish=publisher.publish,
    )
    start_health_server(settings.health_port, poller.diagnostics)

    stop = asyncio.Event()

    def _stop(*_: object) -> None:
        stop.set()

    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)

    poll_task = asyncio.create_task(poller.poll_loop(plan))
    await stop.wait()
    poll_task.cancel()
    await publisher.close()
    client.close()
    log.info("gateway_stopped")


if __name__ == "__main__":
    asyncio.run(main())