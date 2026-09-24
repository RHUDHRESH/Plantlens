/**
 * Equipment symbol API (ISA-101 / ISA-5.1 / IEC 60617 inspired). Single entry point for every
 * 2D surface: Studio palette + nodes, 2D plant map, Overview, pattern library, coverage.
 *
 * Rules: monochrome line art on neutral fill (`--equipment-stroke`, `--equipment-fill`);
 * running state is shown by fill (filled = running, outline = stopped), never by colour;
 * abnormal status adds a status-coloured outline + the shape-coded PriorityGlyph badge.
 *
 * NOTE: this file is the contract. Shapes are plain data in ./geometry.ts (shared with the static
 * SVG build in packages/icons); ./library.tsx maps them to React.
 */
import type { ReactElement, SVGProps } from "react";
import type { StatusKind } from "../ui/primitives";
import { EquipmentBadge } from "./EquipmentBadge";
import type { SensorMounting, SymbolKindName } from "./geometry";
import { SYMBOL_RENDERERS } from "./library";

export { EquipmentBadge, isAbnormalStatus, type EquipmentBadgeProps } from "./EquipmentBadge";
export {
  SYMBOL_KINDS,
  SYMBOL_META,
  symbolGeometry,
  type SensorMounting,
  type SymbolCategory,
  type SymbolMetaEntry,
  type SymbolPrim,
} from "./geometry";

export type SymbolKind =
  | "motor"
  | "dc_motor"
  | "pump_centrifugal"
  | "pump_pd"
  | "fan"
  | "blower"
  | "compressor"
  | "vfd"
  | "inverter"
  | "transformer"
  | "breaker"
  | "contactor"
  | "fuse"
  | "disconnect"
  | "busbar"
  | "pv_array"
  | "charge_controller"
  | "battery"
  | "power_supply"
  | "dc_dc_converter"
  | "valve_control"
  | "valve_onoff"
  | "valve_solenoid"
  | "valve_check"
  | "valve_relief"
  | "tank"
  | "heat_exchanger"
  | "boiler"
  | "filter"
  | "conveyor"
  | "coupling"
  | "bearing"
  | "duct"
  | "pipe"
  | "lamp"
  | "plc"
  | "plc_io"
  | "hmi"
  | "sensor"
  | "generic";

// Compile-time guard: the contract union and the geometry's SYMBOL_KINDS list must stay identical.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const KINDS_IN_SYNC: Same<SymbolKind, SymbolKindName> = true;
void KINDS_IN_SYNC;

export type RunState = "running" | "stopped" | "unknown";

export interface EquipmentSymbolProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  kind: SymbolKind;
  size?: number;
  state?: RunState;
  status?: StatusKind;
  /** Instrument letters for kind="sensor" (ISA-5.1 bubble), e.g. "TT", "PT", "IT", "ST", "VT". */
  tag?: string;
  title?: string;
  /** kind="sensor" only: "panel" draws the ISA-5.1 horizontal line (panel-mounted instrument). */
  mounting?: SensorMounting;
  /** Draw the shape-coded status badge (PriorityGlyph) in the top-right corner when abnormal. */
  badge?: boolean;
}

export type SymbolRenderer = (props: {
  state: RunState;
  tag?: string | undefined;
  mounting?: SensorMounting | undefined;
  size?: number | undefined;
}) => ReactElement;

export function EquipmentSymbol({
  kind,
  size = 48,
  state = "unknown",
  status = "normal",
  tag,
  title,
  mounting,
  badge = false,
  className,
  ...rest
}: EquipmentSymbolProps) {
  const render = SYMBOL_RENDERERS[kind] ?? SYMBOL_RENDERERS.generic;
  // Keep the badge ~13 px on screen whatever the symbol size (clamped to the 48-unit grid).
  const badgeUnits = Math.min(20, Math.max(9, (13 * 48) / Math.max(size, 1)));
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={["pl-symbol", `pl-symbol--${status}`, `pl-symbol--${state}`, className].filter(Boolean).join(" ")}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {render({ state, tag, mounting, size })}
      {badge ? <EquipmentBadge status={status} mode="svg" size={badgeUnits} x={44} y={4} title="" /> : null}
    </svg>
  );
}

const COMPONENT_TYPE_MAP: Record<string, SymbolKind> = {
  dc_power_supply: "power_supply",
  dc_dc_converter: "dc_dc_converter",
  battery_module: "battery",
  fuse_protection_block: "fuse",
  relay_contactor: "contactor",
  plc_digital_output_module: "plc_io",
  plc_analog_input_module: "plc_io",
  plc_digital_input_module: "plc_io",
  dc_motor_12v: "dc_motor",
  bldc_fan: "fan",
  industrial_blower: "blower",
  pump: "pump_centrifugal",
  solenoid_valve: "valve_solenoid",
  belt_coupling: "coupling",
  bearing_block: "bearing",
  air_duct: "duct",
  fluid_pipe: "pipe",
  tank_reservoir: "tank",
  filter_mesh_restriction: "filter",
  current_sensor: "sensor",
  voltage_sensor: "sensor",
  rpm_tachometer: "sensor",
  vibration_sensor: "sensor",
  temperature_sensor: "sensor",
  airflow_sensor: "sensor",
  pressure_sensor: "sensor",
  limit_switch: "sensor",
};

const SENSOR_LETTERS: Record<string, string> = {
  current_sensor: "IT",
  voltage_sensor: "ET",
  rpm_tachometer: "ST",
  vibration_sensor: "VT",
  temperature_sensor: "TT",
  airflow_sensor: "FT",
  pressure_sensor: "PT",
  limit_switch: "ZS",
  "sensor.voltage": "ET",
  "sensor.current": "IT",
  "sensor.rpm": "ST",
  "sensor.temperature": "TT",
  "sensor.vibration": "VT",
};

const ASSET_TYPE_MAP: Record<string, SymbolKind> = {
  "source.solar": "pv_array",
  "source.mains": "transformer",
  "storage.battery": "battery",
  "distribution.dc_bus": "busbar",
  "distribution.breaker": "breaker",
  "drive.inverter": "vfd",
  "control.charge_controller": "charge_controller",
  "load.motor_3phase": "motor",
  "load.lamp": "lamp",
  "sensor.voltage": "sensor",
  "sensor.current": "sensor",
  "sensor.rpm": "sensor",
  "sensor.temperature": "sensor",
  "sensor.vibration": "sensor",
  "control.plc": "plc",
  "control.hmi": "hmi",
};

export function symbolForComponentType(componentTypeId: string): SymbolKind {
  return COMPONENT_TYPE_MAP[componentTypeId] ?? "generic";
}

export function symbolForAssetType(assetType: string | null | undefined): SymbolKind {
  return (assetType && ASSET_TYPE_MAP[assetType]) || "generic";
}

export function sensorLetters(typeId: string | null | undefined): string | undefined {
  return typeId ? SENSOR_LETTERS[typeId] : undefined;
}
