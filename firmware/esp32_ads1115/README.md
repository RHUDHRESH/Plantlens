# PlantLens Firmware — ESP32 ADS1115 Modbus RTU slave (reference only)

A reference hardware source that exposes analog signals (via ADS1115 ADC) over
Modbus RTU so the `modbus_adapter` (pymodbus 3.6.9) can read them as FC04 input
registers. Production swap to OPC-UA (`opcua_adapter`, asyncua 2.0) requires
**no change above `sources/`** — that is the whole portability claim.

This folder holds reference firmware only; it is not part of the backend build.
