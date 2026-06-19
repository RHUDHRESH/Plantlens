# apps/gateway — Modbus/RS485 gateway (separate process, read-only)

The one place all the serial/hardware pain lives (rule R7). It polls devices, decodes registers,
quality-stamps values, and publishes **the same `TagFrame`** the simulator emits. It NEVER computes
root cause, compiles UI, or runs an LLM. If the gateway dies, the API + last-known snapshot survive.

> Optional for the demo (simulator-first covers it). Build in Chunk 7 when you want the real
> hardware path, and Chunk 12 for the advisory PLC bridge.

## Files
| File | Responsibility |
|------|----------------|
| `gateway/main.py` | entrypoint: load tag_map, build the poll plan, run the poll loop, expose /health |
| `gateway/settings.py` | typed env config (API base URL, ingest token, serial defaults) |
| `gateway/register_codec.py` | decode raw registers → typed values (uint16/int16/float32_be/le/bool) + scale/offset |
| `gateway/serial_client.py` | wrap pymodbus AsyncModbusSerialClient (RTU/RS485) + reconnect |
| `gateway/modbus_poller.py` | batch contiguous registers per device/table; poll on cadence; assign quality |
| `gateway/simulator_adapter.py` | a pymodbus simulator/server target for tests (no real hardware) |
| `gateway/publish.py` | POST TagFrames to the API ingest endpoint (httpx + token) |
| `gateway/health.py` | per-device diagnostics: latency, error rate, CRC fails, reconnects |
| `gateway/plc_bridge/` | DAG-to-PLC advisory bridge (Chunk 12) — see its README |

## Poll plan (modbus_poller)
- Group tags by (device, table, contiguous register range) → batch reads (FC03/FC04). Coalesce to
  reduce serial chatter.
- Cadence from tag_map source.poll_ms (200-250ms demo bench, 500-1000ms slower devices).
- Mark a tag STALE after ~3× its poll interval with no fresh read; expose quality on every frame.
- Diagnostics counters per device.

## Function-code baseline
- Reads: FC03 (holding) / FC04 (input). Reads are the whole product surface.
- Writes: FC06/FC16 ONLY inside `plc_bridge`, behind a hard allowlist. No arbitrary writes ever,
  and never from Studio.

## The contract
Every published frame validates against `packages/contracts/tag_frame.schema.json` with
`source="modbus_rtu"`. That is the entire integration story — everything downstream is unchanged.
