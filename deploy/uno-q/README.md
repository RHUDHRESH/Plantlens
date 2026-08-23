# PlantLens on Arduino UNO Q

The deployed UNO Q path is read-only and advisory. It passively observes the Easy302/HMI RS485
network and runs shadow edge inference inside the Linux container. It does not write Modbus coils
or registers and has no motor-control authority.

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
