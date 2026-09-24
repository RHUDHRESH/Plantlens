# apps/gateway — serial/Modbus gateway (separate process, read-only)

The one place all the serial/hardware pain lives (rule R7). It reads devices, decodes values,
quality-stamps them, and publishes **the same `TagFrame`** the simulator emits (rule R3). It never
computes root cause, compiles UI, runs an LLM, or writes to hardware: only Modbus FC01–FC04 exist
in the code path, behind a guard that raises on anything else.

```text
serial / TCP ──> transport ──> modbus.scan_engine | line.reader ──> publish.uplink ──POST /api/ingest/frame/batch──> apps/api
```

## Layout

| Module | Responsibility |
|---|---|
| `gateway/transport/discovery.py` | Enumerate ports, VID/PID table, resolve a selector to exactly one `PortIdentity` (never guesses) |
| `gateway/transport/serial_link.py` | Async serial link: one reader thread, exclusive open, reset policy, hotplug watchdog, capped backoff, `LinkState` events |
| `gateway/line/framer.py` | Bytes → complete lines (length cap, UTF-8/control-byte filter, no partial lines) |
| `gateway/line/protocols.py` | PL1 (checksummed), header-driven CSV, legacy `key=value`, JSON; every error counted per line |
| `gateway/line/reader.py` | Line mode: link → framer → decoder → TagFrames, STALE on silence |
| `gateway/modbus/guard.py` | Read-only whitelist (FC01–04). `ReadRequest` cannot be built with a write code |
| `gateway/modbus/batch_planner.py` | Merge tags into contiguous reads (gap ≤ 8, ≤ 125 registers / 2000 bits); learn from exception 02 |
| `gateway/modbus/transports.py` | Minimal RTU master (over `SerialLink`, t3.5, CRC) and TCP master; typed errors |
| `gateway/modbus/scan_engine.py` | One scan cycle per device, per-device timeout/retries/backoff, GOOD/BAD/STALE |
| `gateway/publish/uplink.py` | One background task, bounded ordered queue, batches, 4xx quarantine, 5xx retry |
| `gateway/tag_frame.py` | TagFrame model identical to the API/contract (patterns, aware datetimes, `ingest_ts`, `scenario_id`) |
| `gateway/health.py` | Threaded `/health`, `/commission/ports`, `/commission/probe` (default port 9101) |
| `gateway/diagnostics.py` | CLI: list/auto-detect ports, probe, parse a line |
| `gateway/raw_serial_reader.py`, `modbus_poller.py`, `serial_client.py`, `publish/__init__.py` | Compatibility facades for the old entry points |
| `gateway/plc_bridge/` | Advisory PLC bridge (Chunk 12), see below |

> **R7 note — to be moved:** `gateway/plc_bridge/diagnosis_encoder.py` maps situation types to
> diagnosis codes. That is diagnosis knowledge living in the gateway. It is left untouched here
> (the bridge only writes in-memory snapshots, no transport), but it should move out of the
> gateway process; it must not be moved into `apps/api` as part of this work.

## Supported USB adapters

| Adapter | VID:PID | Typical device |
|---|---|---|
| CH340 / CH341 | `1A86:7523` | cheap RS-485 sticks, Uno clones |
| CH9102 | `1A86:55D4` | newer RS-485 sticks, ESP32 boards |
| Silicon Labs CP210x | `10C4:EA60` | industrial RS-485 converters |
| FTDI FT232R | `0403:6001` | Waveshare/DSD TECH RS-485 |
| FTDI FT-X (FT230X/FT231X) | `0403:6015` | isolated RS-485 converters |
| Prolific PL2303 | `067B:2303` | legacy converters |
| Arduino (any) | `2341:*`, `2A03:*` | Uno R3/R4, Uno over USB-C, Nano Every |

## How auto-detect works

The serial selector comes from `GATEWAY_SERIAL_PORT` (legacy name, highest priority), then
`GATEWAY_LINK__SELECTOR`, then the tag map's `sources[].serial.port`.

| Selector | Meaning |
|---|---|
| *(empty)* / `auto` | Exactly one known adapter (table above) must be plugged in. Zero or several → error that lists the candidates. Built-in UARTs (`/dev/ttyS*`) are never picked. |
| `1A86:7523` / `1A86:7523:SERIAL` | Match VID:PID (and serial number) |
| `sn:85735313932351B0A1F1` | Match the USB serial number (Arduino boards have unique ones) |
| `/dev/serial/by-id/usb-…` | Stable Linux path, recommended |
| `/dev/ttyACM0`, `COM5` | Explicit port |

A selector written for the other OS (the demo tag map says `COM3`; on Linux) is treated as
`auto`. After the first successful open the link remembers the port's identity (VID/PID + serial
number, else USB location, else by-id path). After an unplug it rediscovers **that identity**, so a
Uno that comes back as `/dev/ttyACM1` is found again. Rediscovery backs off 0.25 s → 0.5 → 1 → 2 →
5 s (cap); the backoff resets only after 5 s of stable connection, so a flapping cable can never
cause a reopen loop (every reopen of a Uno also resets it).

## Reset policies (`GATEWAY_LINK__RESET_POLICY`)

Opening a port asserts DTR, which resets Uno/Nano/Mega boards (auto-reset circuit).

* `hold_dtr_low` (default for Modbus): DTR and RTS are configured low before `open()`. RS-485
  adapters don't care; on Windows/macOS this avoids the Uno reset. On Linux the kernel raises DTR
  for a few µs inside `open()` and a Uno may still reset (fix: `stty -F /dev/ttyACM0 -hupcl` once,
  or a 10 µF capacitor RESET→GND on the board). The stream is joined mid-line, so the first
  partial line is discarded.
* `wait_for_reset` (default for line mode): open normally, then discard boot-loader noise for up to
  `GATEWAY_LINK__RESET_SETTLE_MS` (default 2000). If the ready banner
  (`GATEWAY_LINK__READY_BANNER`, default regex `^#PLANTLENS READY`) arrives first, the link is ready
  immediately and line-aligned. `GATEWAY_LINK__READY_TIMEOUT_MS` (default 0) extends the wait for
  the banner beyond the settle window. Without a banner the input buffer is flushed after the settle
  time and the first partial line is dropped.

The link opens the port with `exclusive=True` (flock) on POSIX; a second process gets a clear
"could not exclusively lock" error instead of stealing bytes. `/commission/probe` refuses (HTTP
409) a port a gateway link currently holds.

## PL1 line protocol (recommended for microcontrollers)

```text
#PLANTLENS READY v1 hz=20 keys=vib,current,voltage,temp,aux4,aux5
PL1,1523,vib=1.234,current=0.512,voltage=4.998~B*02
```

* `PL1,<seq>,<key>=<value>[~Q],...*HH` then `\n` (or `\r\n`). Max line length 512 bytes
  (`GATEWAY_LINE__MAX_LINE_BYTES`).
* `seq`: unsigned decimal, +1 per line, wraps at 2³². Forward gaps are counted as lost lines
  (`seq_gaps`), a backwards jump as a device restart (`seq_restarts`).
* `HH`: **CRC-8/SMBUS** — polynomial `0x07`, init `0x00`, no reflection, no final XOR — over every
  byte from the `P` of `PL1` up to, not including, `*`, as two hex digits. Check value:
  `crc8("123456789") = 0xF4`. (CRC-8 chosen over XOR: XOR misses swapped bytes and even bit-errors.)
* values: decimal with optional exponent (`1e3`, `-.5`), `true`/`false`, or `nan`/`inf`/`null`,
  which are published as quality **BAD** with value null (never GOOD).
* optional quality suffix: `~B` BAD, `~U` UNCERTAIN, `~G` GOOD (the Uno sketch marks a clipped ADC
  reading `~B`).
* keys are mapped with `GATEWAY_LINE__COLUMN_MAP`, or used directly if they are tag ids.
  Unknown keys are **rejected and counted** (`unknown_keys`), never remapped.
* lines starting with `#` are comments (banner, `#PLANTLENS STATS seq=… drops=…`).

Reference implementations: `build_pl1()` in `gateway/line/protocols.py`,
`arduino/uno_plain/plantlens_uno/plantlens_uno.ino` (`crc8()`).

## Header-driven CSV

```text
seq,t_ms,vib_mean,vib_p2p,current_mean,voltage_mean,airflow_mean,rpm_hz,quality
42,168000,512.3,87,2011.0,3301.2,1022.4,24.50,GOOD
```

* The first line whose fields are all identifiers is the header; `,` `;` and TAB separators are
  detected from it (with `;`/TAB, a decimal comma `1,5` is accepted). A header that changes
  mid-stream replaces the old one (`header_changes`); re-sending the same header is a no-op.
* Columns → tags: `GATEWAY_LINE__COLUMN_MAP='{"vib_p2p":"VIB_X","current_mean":"MOTOR_301_CURRENT"}'`.
  A column named exactly like a tag id maps itself. Unmapped columns are ignored.
* Special columns: `seq`/`sequence` (gap tracking), `quality` (row quality, `GOOD` or anything else
  → BAD/UNCERTAIN for the row), `timestamp*`/`t_ms`/`millis`/`micros` (ignored: the gateway stamps
  its own clock).
* Rows before a header, or with a different column count, are rejected and counted
  (`csv_no_header`, `csv_width`). A device that never prints a header can be given one with
  `GATEWAY_LINE__CSV_HEADER="A0,A1,A2"`.

Legacy formats still accepted in `auto` mode: `TAG=value` / `TAG:value` pairs separated by `,` `;`
or TAB, `TAG,value`, JSON objects (`{"tag":"VIB_X","value":1.2}` or `{"VIB_X":1.2}`), and a bare
number mapped to `LINE_DEFAULT_TAG_ID`. Force one protocol with `GATEWAY_LINE__PROTOCOL=pl1|csv|kv|json`.

Line frames are stamped `source="serial_line"` by default (`GATEWAY_LINE__SOURCE`), a value
of the TagFrame contract's `source` enum. They are never stamped as Modbus.

## Modbus scanning

* Planner: tags sorted by (source, unit, function, address), merged while the gap ≤ `GATEWAY_MODBUS__MAX_GAP`
  (8) and span ≤ 125 registers (2000 coils/inputs). The demo tag map is **1 request per scan**
  (was 21). An exception 02 (illegal data address) splits the block at its middle tag; the split is
  remembered; a single tag that still fails is published BAD instead of being retried.
* Scan engine: a device = (source, unit). Timeout `GATEWAY_MODBUS__TIMEOUT_MS` (250), retries
  `GATEWAY_MODBUS__RETRIES` (1), t3.5 before every RTU frame (1.75 ms above 19200 baud; override with
  `GATEWAY_MODBUS__INTER_REQUEST_MS`). The first timeout/CRC/link failure in a cycle sends that device
  into backoff (0.25 s → 5 s), so a dead slave costs at most `timeout × (retries+1)` of bus time per
  attempt and other devices on the bus keep their scan rate.
* Quality: GOOD on a decoded read, BAD on an exception response or codec error, STALE (value null)
  once the last GOOD read is older than the tag's `quality_policy.stale_after_ms`; re-asserted once
  per stale period.
* Every Modbus source in the tag map gets a device (`modbus_rtu` over the serial link, `modbus_tcp`
  with `host`/`port`), stamped with its own `source`. RTU sources that resolve to the same port
  share one bus/link.
* `/health` → `modbus.devices[]`: `requests`, `good_reads`, `timeouts`, `crc_errors`,
  `frame_errors`, `exception_responses`, `illegal_address_splits`, `link_errors`, `reconnects`,
  `overruns`, `stale_tag_count`, `last_error`. Legacy top-level keys (`error_count`,
  `crc_failures`, `reconnect_count`, `stale_tag_count`, `last_good_read_ts`) are kept.

## Uplink

Frames are queued (bounded, 5000, oldest dropped and counted) and sent in order by one task in
batches of ≤ 200 or every 250 ms to `/api/ingest/frame/batch`. `accepted < total` is counted.
4xx (except 408/429) quarantines the batch (logged with the API's message, never retried); 5xx and
network errors retry with capped backoff, re-queued in original order. `/health` → `uplink`:
`queue_depth`, `dropped`, `quarantined`, `retries`, `last_status`, `last_error`.

## Configuration reference

| Variable | Default | |
|---|---|---|
| `GATEWAY_SERIAL_MODE` | `modbus` | `modbus` (all Modbus sources) or `line` (no Modbus source needed) |
| `GATEWAY_SERIAL_PORT` | — | selector override (see auto-detect) |
| `GATEWAY_SERIAL_BAUDRATE` | tag map / 115200 line / 9600 RTU | |
| `GATEWAY_LINK__RESET_POLICY` | `hold_dtr_low` (modbus), `wait_for_reset` (line) | |
| `GATEWAY_LINK__RESET_SETTLE_MS` / `__READY_BANNER` / `__READY_TIMEOUT_MS` | 2000 / `^#PLANTLENS READY` / 0 | |
| `GATEWAY_LINK__LOCAL_ECHO` | false | adapters that echo their own TX |
| `GATEWAY_LINE__PROTOCOL` / `__COLUMN_MAP` / `__CSV_HEADER` / `__SOURCE` / `__STALE_AFTER_MS` | auto / {} / — / manual / tag map | |
| `GATEWAY_MODBUS__TIMEOUT_MS` / `__RETRIES` / `__MAX_GAP` / `__INTER_REQUEST_MS` | 250 / 1 / 8 / t3.5 | |
| `GATEWAY_UPLINK__BATCH_MAX` / `__FLUSH_MS` / `__QUEUE_MAX` | 200 / 250 / 5000 | |
| `API_BASE_URL`, `GATEWAY_INGEST_TOKEN`, `TAG_MAP_PATH`, `GATEWAY_ID`, `HEALTH_PORT` | | as before |

## Validate on real hardware

Run from `apps/gateway` with the venv active (`uv sync --extra dev` or the repo `.venv`). On
Linux add yourself to `dialout` once: `sudo usermod -aG dialout $USER` (log out/in).

**1. Enumerate and auto-detect**

```bash
python -m serial.tools.list_ports -v              # VID:PID, serial number per port
ls -l /dev/serial/by-id/                            # stable names (Linux)
python -m gateway.diagnostics --detect auto         # must pick exactly one, or list candidates
python -m gateway.diagnostics --detect 1A86:7523    # RS-485 stick by VID:PID
```
Expect: the RS-485 adapter shows as CH340/CP210x/FTDI; the Uno as `Arduino` (`2341:0043`
R3, `2341:1002` R4) or a CH340 clone. With both plugged in, `auto` must refuse and list both.

**2. Uno over USB-C (line mode)**

Flash `arduino/uno_plain/plantlens_uno/plantlens_uno.ino` (Arduino IDE or
`arduino-cli compile -b arduino:avr:uno arduino/uno_plain/plantlens_uno && arduino-cli upload -b arduino:avr:uno -p /dev/ttyACM0 arduino/uno_plain/plantlens_uno`).
Close the IDE serial monitor (exclusive open).

```bash
python -m serial.tools.miniterm /dev/ttyACM0 115200   # see '#PLANTLENS READY v1' then PL1 lines; Ctrl-] to quit
python -m gateway.diagnostics --line "$(python -c 'from gateway.line.protocols import build_pl1; print(build_pl1(1, {"vib": 1.25}))')"
GATEWAY_SERIAL_MODE=line GATEWAY_SERIAL_PORT=sn:<your-uno-serial> \
GATEWAY_LINE__COLUMN_MAP='{"vib":"VIB_X","current":"MOTOR_301_CURRENT","voltage":"BUS_101_V"}' \
python -m gateway.main &
curl -s localhost:9101/health | python -m json.tool
```
Check in `/health`: `links[0].state == "connected"`, `banner_seen >= 1`, `line.decoder.accepted_lines`
rising ~20/s, `checksum_failures == 0`, `seq_gaps` ≈ 0, `line.framer.invalid_utf8 == 0`.

- Unplug the USB-C cable for 10 s: `links[0].state` → `backoff`, tags turn `STALE` within
  `stale_after_ms`, no CPU spin (`open_failures` grows by ~1 per 5 s at the cap).
- Plug it back (even into another port): data resumes within backoff + ~0.3 s (banner),
  `reconnect_count` +1, `identity.device` may change, `identity.serial_number` must not.
- `curl "localhost:9101/commission/probe?port=/dev/ttyACM0"` must answer 409 while connected.
- Garbage test: set the monitor to 9600 baud against the 115200 sketch → only `invalid_utf8`/
  `control_bytes`/`rejected` counters move; no values are published.

**3. RS-485 adapter (Modbus RTU)**

Wire A/B (and GND/reference) to the slave, 120 Ω termination at both bus ends. Set the tag map's
`serial` block (baudrate, parity, `slave_id`, `address_base`) to the device manual.

```bash
GATEWAY_SERIAL_PORT=/dev/serial/by-id/usb-1a86_USB_Serial-if00-port0 python -m gateway.main &
curl -s localhost:9101/health | python -m json.tool
```
Check `modbus.requests_per_scan` (1 for the demo map), `devices[].good_reads` rising at
`1000/poll_ms` per second, `timeouts`/`crc_errors` ≈ 0.

- `crc_errors` or `frame_errors` rising: wrong baud/parity, missing termination/bias, A/B swapped.
- `timeouts` only: wrong `slave_id`, A/B swapped, or slave not powered.
- `exception_responses` with `illegal_address_splits`: map contains registers the device doesn't
  implement; the planner splits automatically; tags that remain unreadable are published BAD.
- `GATEWAY_LINK__LOCAL_ECHO=true` if your adapter echoes its own transmission (frame_errors on
  every read).
- Unplug the adapter: `link_errors` +1, device backoff, tags STALE after `stale_after_ms`;
  replug: reads resume, `reconnects` +1.
- Pull the slave's A/B wire: `timeouts` rise, that device goes STALE within
  `stale_after_ms + poll + timeout×(retries+1)` (≈ 2.25 s demo), others keep scanning.

**4. Contract/regression suite (no hardware)**

```bash
cd apps/gateway && timeout 300 python -m pytest -q -p no:cacheprovider
```

## Tests

`tests/` covers the framer/parsers (with hypothesis property tests), pty-backed fake devices
(split lines, garbage, reset banner, unplug/replug, exclusive open), the batch planner, the scan
engine against pymodbus' TCP server and RTU over a pty "bus" (silent slave, exception 02 split,
request counting), the write guard, the uplink (ordering, 4xx quarantine, 5xx retry) and the
TagFrame JSON-schema contract. `tests/test_firmware_output.py` compiles both Arduino sketches on the
host with a stub `Arduino.h` and parses their serial output with the real decoder (skipped without
g++). `pytest-timeout` (30 s) and a conftest check for leaked non-daemon threads keep the suite from
ever hanging.
