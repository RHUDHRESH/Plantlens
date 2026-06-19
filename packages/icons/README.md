# packages/icons — domain SVG symbol library

Process/electrical symbols PlantLens needs that Lucide does NOT provide: solar array, MPPT/charge
controller, battery bank, DC busbar, breaker, inverter/VFD, 3-phase motor, lamp load, voltage/
current/RPM/temperature/vibration sensors, PLC, HMI panel.

## Rules (DESIGN_SYSTEM.md)
- One clean, schematic SVG per asset `type` in plant.schema.json. Keep them monochrome + styleable
  via `currentColor` so status color comes from the node, not the symbol.
- Use Lucide for UI chrome (buttons, menus) — NOT for these domain symbols.
- The 2D map (`apps/web/src/features/maps2d`) and 3D model names (`plant.coords_3d.model`) reference
  these by a stable key, e.g. `symbol.motor`, `symbol.dc_bus`.

## Files
| File | Symbol |
|------|--------|
| `svg/solar.svg` | source.solar |
| `svg/charge_controller.svg` | control.charge_controller |
| `svg/battery.svg` | storage.battery |
| `svg/dc_bus.svg` | distribution.dc_bus |
| `svg/breaker.svg` | distribution.breaker |
| `svg/inverter.svg` | drive.inverter |
| `svg/motor.svg` | load.motor_3phase |
| `svg/lamp.svg` | load.lamp |
| `svg/sensor.svg` | sensor.* (badge the kind) |

SVG symbols live in `svg/`. The 2D map resolves them via `apps/web/src/features/maps2d/iconRegistry.tsx`
using `currentColor` so status tint comes from the node, not the symbol file.
