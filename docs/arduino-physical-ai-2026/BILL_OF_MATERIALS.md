# Bill of Materials and Commissioning Status

This BOM distinguishes components directly evidenced by the deployed prototype from reference-only components and items whose exact part numbers are not yet recorded. No price, purchase status, calibration, or physical attachment is invented.

## Deployed passive industrial-observation topology

| Component | Quantity | Role | Evidence status | Integration notes |
| --- | ---: | --- | --- | --- |
| Arduino UNO Q | 1 | Dual-processor physical-AI host: STM32U585 acquisition and Qualcomm QRB2210 local inference/HMI. | Connected-board benchmark and deployment source documented. | Primary competition board; MCU and MPU communicate using Arduino Bridge. |
| MAX485-compatible RS485 transceiver | 1 | Interfaces UNO Q UART with the existing industrial differential bus. | Prototype pin map documented. | D1/TX to DI, D0/RX to RO, D2 to tied DE and /RE, shared GND. Exact breakout part number unrecorded. |
| Existing industrial controller / device | 1 or more | Provides native Modbus RTU process registers. | Captured CRC-valid native traffic and passive parser regression fixtures documented. | Native register semantics and scaling are not yet fully commissioned. |
| Existing industrial HMI | 1 | Existing Modbus bus master and operator-side industrial equipment. | Deployment architecture documents HMI-owned bus. | Remains the sole master during normal passive PlantLens operation. |
| RS485 signal wiring / common reference | 1 set | Connects A/B differential bus and common electrical reference. | Prototype topology documented. | Confirm termination, reference, isolation, and site electrical limits before installation. |
| UNO Q power supply | 1 | Powers the UNO Q independently of the motor load path. | Required by deployed board topology; exact supply model unrecorded. | Use a rated board-compatible supply; never power the motor from GPIO. |
| Independent protected machine supply | 1 | Powers the observed industrial equipment independently of PlantLens. | Required architecture; exact voltage, rating, and model not evidenced. | Fuse and current-limit appropriately; motor control remains external. |

## Optional analog-reference sensing topology

These components appear as supported or planned channels in the separate reference acquisition sketch. Their exact purchase status, installed models, calibration, and physical validation are **not established by this repository**.

| Reference component | Quantity | Firmware assignment | Intended diagnostic value | Status |
| --- | ---: | --- | --- | --- |
| Vibration sensor / accelerometer | 1 | A0 | RMS, spectral changes, imbalance, bearing-related signatures. | Functional requirement; exact model and mounting unrecorded. |
| Isolated motor-current sensor | 1 | A1 | Load current and overload evidence. | Functional requirement; exact model, range, and scale unrecorded. |
| Safe isolated/divided voltage sensor | 1 | A2 | Supply disturbance and voltage-current-power consistency. | Functional requirement; exact model and calibration unrecorded. |
| Airflow sensor | 1 | A3 | Flow restriction and fan operating-state evidence. | Functional requirement; exact model, placement, and scale unrecorded. |
| Hall or optical RPM sensor | 1 | D2 in reference firmware | Shaft-speed and current-before-RPM causal evidence. | Reference only; conflicts with D2 RS485 direction if combined without remapping. |
| Temperature sensor | 1 | Not yet assigned | Motor thermal trend and bearing/overload corroboration. | Planned; firmware pin/driver and physical commissioning not evidenced. |
| Built-in LED / buffered buzzer | 1 | `LED_BUILTIN` reference | Local operator-visible advisory indication. | Built-in LED assignment exists in reference code; external buzzer is not evidenced. |
| Motor / fan / blower bench | 1 | External independent equipment | Provides repeatable physical operating and fault conditions. | Intended evaluation rig; exact nameplate, rated power, and physical validation records not present. |

## Topology and safety caveat

The documented deployed topology is **passive RS485 observation**. The analog acquisition sketch is a **separate reference firmware configuration**. D2 is used for MAX485 direction in the deployed topology and RPM interrupts in the analog reference. The two firmwares must not be described as concurrently validated; a combined build must remap and verify the RPM input first.

## Procurement fields to complete from real evidence

- UNO Q invoice or purchase proof.
- Exact MAX485 breakout model and electrical ratings.
- Observed controller and HMI model numbers.
- Sensor part numbers, rated ranges, isolation method, and calibration references.
- Supply voltage/current ratings, fusing, terminals, and enclosure details.
- Physical photographs and a wiring diagram matching the actual assembled configuration.

Related: [`HARDWARE_AND_WIRING.md`](HARDWARE_AND_WIRING.md), [`EVIDENCE_LEDGER.md`](EVIDENCE_LEDGER.md), and [`SUBMISSION_CHECKLIST.md`](SUBMISSION_CHECKLIST.md).
