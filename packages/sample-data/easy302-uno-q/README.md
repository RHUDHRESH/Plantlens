# Easy302 + UNO Q commissioning profile

This is a disabled-by-default, read-only Modbus RTU profile derived from the supplied
Easy302 A09 hardware guide and `REGISTER VALUES.xlsx`. It is groundwork, not a claim
that the unconnected PLC has been commissioned.

## Assumptions requiring an on-hardware read test

- PLC station address `1`, `38400 8N1`, holding registers / function 03.
- Spreadsheet addresses are one-based, so register `1` is pymodbus address `0`.
- FLOAT values occupy two words and use CDAB word order.
- The spreadsheet note `VFD CURRENT: div by 100` is represented by scale `0.01`.
- `VFD POWER` uses scale `0.01` because its decimal-points column is `2`.
- `VIB TEMP: div by 10` is represented by scale `0.1`.

Do not enable the gateway until these assumptions pass the commissioning read test.
The gateway performs reads only. PlantLens must not write coils or registers.

## UNO Q launch settings

```text
TAG_MAP_PATH=/app/source/packages/sample-data/easy302-uno-q/tag_map.json
GATEWAY_SERIAL_PORT=/dev/ttyUSB0
GATEWAY_SERIAL_MODE=modbus_rtu
POLL_ENABLED=true
PLC_BRIDGE_ENABLED=false
```

Use an isolated USB-to-RS485 adapter. Wire `485+` to adapter D+/A,
`485-` to D-/B, and signal GND to signal GND. Do not connect protective earth to
the Easy302 communication GND. Use shielded twisted pair and 120-ohm termination at
both bus ends as specified in the hardware guide.

## First connection gate

1. Keep the machine outputs de-energized and have a qualified controls engineer wire it.
2. Confirm the PLC's actual station, baud, parity, and Modbus server configuration in AutoShop.
3. Read registers 1-2 only and compare all supported float word orders to a known displayed value.
4. Verify every tag's engineering unit and plausible range before marking it `GOOD`.
5. Run a 30-minute read-only soak test; require zero unintended writes and quantify timeout/CRC rate.
