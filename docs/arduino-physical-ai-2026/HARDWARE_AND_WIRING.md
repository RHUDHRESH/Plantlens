# Hardware and Wiring

## Functional bill of materials

| Item | Function | Submission evidence |
| --- | --- | --- |
| Arduino UNO Q | Primary board, local AI, web UI, deterministic I/O | Show board and powered application in video |
| DC motor, fan, and blower bench | Rotating equipment under test | Show nameplates where readable |
| Vibration sensor/accelerometer | Mechanical signature | Record exact model and mounting method |
| Motor-current sensor | Electrical load signature | Record range, isolation, and calibration |
| RPM/tachometer sensor | Shaft-speed evidence | Show pulse target or Hall/optical arrangement |
| Temperature sensor | Thermal trend | Record attachment location |
| Airflow sensor | Blockage and load evidence | Show placement and flow direction |
| Voltage sensor | Supply-quality evidence | Record safe measurement range |
| LED and/or buzzer | Local physical alert | Demonstrate response to accepted abnormal event |
| Protected motor driver/power stage | Powers the machine independently of UNO Q logic | Show fuse/current limiting and common reference arrangement |

Replace functional names with exact part numbers before final submission when those numbers are available.

## Confirmed passive RS485 prototype wiring

| UNO Q | MAX485-compatible transceiver | Purpose |
| --- | --- | --- |
| D1 / TX | DI | UART transmit for isolated, explicit read-only commissioning probes. |
| D0 / RX | RO | Passive UART receive from the industrial bus. |
| D2 | DE and /RE tied | LOW for normal passive listening; HIGH only during an explicit commissioning read. |
| GND | GND | Shared signal reference. |

The observed bus uses Modbus RTU at **38,400 baud, 8N1**. Normal operation invokes only the passive `easy302/sniff` firmware endpoint; the existing HMI remains bus master. Commissioning permits FC03/FC04 reads only. See the [complete bill of materials](BILL_OF_MATERIALS.md) and [UNO Q deployment documentation](../../deploy/uno-q/README.md).

## Wiring boundary

```text
Motor supply -> protected driver/power stage -> motor/fan/blower
                               |
                 isolated/current-limited sensors
                               |
                        UNO Q analog/digital I/O

UNO Q GPIO -> resistor/driver -> LED or buzzer
```

## Non-negotiable rules

- Do not power the motor directly from an UNO Q pin.
- Use a separate protected motor supply and a suitable driver or relay stage.
- Keep sensor inputs within the UNO Q electrical limits.
- Use a voltage divider/isolation stage appropriate to the measured bus.
- Fuse the load path and strain-relieve rotating-equipment wiring.
- Mount the vibration sensor rigidly and consistently; loose placement destroys fingerprint repeatability.
- Record sensor orientation and mounting point so training and test conditions match.
- The application is advisory; automatic trip/control is outside the prototype boundary.

## Alternative analog-reference firmware pin map

The standalone acquisition sketch defines these reference assignments. They document code, not verified installed sensors; physical models and calibration remain to be recorded.

| Signal | Sensor model | UNO Q pin/bus | Sample rate | Calibration |
| --- | --- | --- | ---: | --- |
| Vibration | Not recorded | A0 | 800 Hz reference loop | Not commissioned |
| Motor current | Not recorded | A1 | 800 Hz reference loop | Not commissioned |
| RPM | Not recorded | D2 | Interrupt-driven | Not commissioned |
| Temperature | Not recorded | Not assigned | Not implemented | Not commissioned |
| Airflow | Not recorded | A3 | 800 Hz reference loop | Not commissioned |
| Voltage | Not recorded | A2 | 800 Hz reference loop | Not commissioned |
| Alert | Built-in LED reference | `LED_BUILTIN` | n/a | n/a |

**Integration constraint:** D2 controls MAX485 direction in the deployed RS485 bridge but captures RPM interrupts in the separate analog reference. These are alternative firmware configurations. A combined build must remap RPM to another verified interrupt-capable pin before use.
