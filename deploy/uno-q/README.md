# PlantLens on Arduino UNO Q

The deployed UNO Q path is read-only and advisory. It passively observes the Easy302/HMI RS485
network and runs shadow edge inference inside the Linux container. It does not write Modbus coils
or registers and has no motor-control authority.

## Why this runs on an UNO Q

PlantLens uses both processors on the board, and the split is load-bearing rather than incidental.

| Brain | Part | OS | Job in PlantLens |
|---|---|---|---|
| Real-time MCU | STMicroelectronics STM32U585 (Cortex-M33) | Zephyr + Arduino core | UART capture on Serial1, RS485 direction pin, Modbus RTU frame timing, CRC validation |
| Application MPU | Qualcomm Dragonwing QRB2210 (4× Cortex-A53 @ 2.0 GHz, Adreno 702, dual ISP) | Debian Linux | Edge inference, FastAPI runtime, evidence store, React HMI served to the operator |

The seam between them is the Arduino Bridge: `sketch.ino` registers `easy302/sniff` with
`Bridge.provide_safe(...)`, and `passive_gateway.py` calls it with `Bridge.call("easy302/sniff", ...)`.

**Why the MCU has to do the capture.** Modbus RTU delimits frames with silence, not with a byte.
A frame ends after 3.5 character times — **911 µs** at 38,400 8N1 (10 bits/char), and the *Modbus
over Serial Line* specification mandates a fixed **1.750 ms** t3.5 for any baud rate above 19,200.
Either figure is inside the scheduling jitter of an ordinary (non-`PREEMPT_RT`) Linux userspace
process, so frame boundaries recovered on the application processor would be unreliable. The
STM32U585 holds that timing; Linux never has to.

**Why the MPU has to do everything else.** The inference path, the FastAPI runtime, the evidence
store and the operator HMI are all served from the QRB2210's Debian userspace. A classic
8-bit Arduino cannot host them; a Linux-only SBC cannot be trusted with the frame timing above.
The board is the reason the whole product fits in one enclosure on one power rail.

**No accelerator is used, deliberately.** Inference runs on the A53 cores as plain Python — there
is no NPU/DSP offload, no quantization step and no conversion toolchain, so the model that runs on
the board is byte-identical to the one that runs on a developer host (see the replay hash below).
The Adreno 702 and both ISPs are unused today and are the headroom reserved for the vision node
and the high-rate DSP roadmap in `docs/EDGE_AI_RESEARCH_PROGRAM.md`.

### Measured on the connected board — 23-Aug-2026

| Metric | Value |
|---|---|
| Median fused inference latency | 11.6338 ms |
| p95 / max | 11.9572 ms / 35.4903 ms |
| Peak allocation (`tracemalloc`) | 274.34 KiB |
| Epochs | 200 synthetic motor-overload |
| Replay SHA-256 | `2234378f626afb18e2395710b1c45f3a791aa39d963a3de007ad303534afa4a9` |

The same replay hash was produced on the Windows development host, so the compute path is
bit-stable across targets. These are compute-path measurements, not an accuracy result and not an
end-to-end sensor-to-decision latency.

## Confirmed prototype wiring

| UNO Q | MAX485 | Purpose |
|---|---|---|
| D1 / TX | DI | UART transmit for isolated commissioning probes only |
| D0 / RX | RO | UART receive |
| D2 | DE and /RE tied | LOW for passive receive; HIGH only during an explicit read probe |
| GND | GND | Common RS485 reference |

The live HMI bus was identified as Modbus RTU at 38,400 baud, 8N1. Because the HMI is the bus
master, normal PlantLens operation keeps D2 LOW and listens only. Do not run an active probe while
the HMI is polling.

## Firmware

`easy302_bridge/sketch/sketch.ino` provides:

- `easy302/sniff`: bounded passive raw-byte capture
- `easy302/probe`: commissioning-only FC03/FC04 reads; never Modbus writes
- CRC validation and explicit timeout/error results

## Passive live gateway

`plantlens_app/python/passive_gateway.py` continuously calls only `easy302/sniff`, recovers
CRC-valid FC03/FC04 request/reply pairs, and publishes observed native words through the normal
`TagFrame` ingest seam. The HMI remains the sole bus master. Native tags use names such as
`NATIVE_S6_HR_00000` and unit `raw_word`; they are intentionally not relabeled as engineering
signals until scaling and word order have been commissioned.

`plantlens_app/python/main.py` starts this listener on the UNO Q, exposes read-only compatibility
status for the Connection screen, and creates an ephemeral local development JWT key at each app
start so the browser can authenticate without storing a secret in the repository.

## Edge research benchmark

The pure-Python inference path requires no native ML runtime. Copy
`apps/api/app/edge_research/{compact_ensemble,factorial_shadow}.py` and
`scripts/benchmark_edge_ensemble.py` into the UNO Q application container, then run the benchmark
from the directory containing those files. The benchmark uses synthetic standardized features;
it does not claim live fault accuracy.

## Production boundary

Native HMI/device registers are not the canonical PlantLens 1-41 mailbox. Do not label a captured
native word as voltage, current, vibration, temperature, or RPM until the device manual, scale,
word order, and a known physical reference have been commissioned. Missing mappings must produce
`INSUFFICIENT_DATA`, never zero-filled fault evidence.
