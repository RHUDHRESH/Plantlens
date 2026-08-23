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

## Pin map worksheet

The final pin assignment depends on the exact sensor modules. Complete this table before filming:

| Signal | Sensor model | UNO Q pin/bus | Sample rate | Calibration |
| --- | --- | --- | ---: | --- |
| Vibration |  |  |  |  |
| Motor current |  |  |  |  |
| RPM |  |  |  |  |
| Temperature |  |  |  |  |
| Airflow |  |  |  |  |
| Voltage |  |  |  |  |
| Alert LED/buzzer |  |  | n/a | n/a |
