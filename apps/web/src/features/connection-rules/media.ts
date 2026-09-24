/**
 * Media vocabulary + the deterministic port checks mirrored from apps/api/app/library/ports.py.
 * Keep `quantityCompatible` in lock-step with `_quantity_compatible` there (parity test in engine.test).
 */
import { MEDIA, type Medium, type Verdict } from "./types";

export const MEDIUM_LABEL: Record<Medium, string> = {
  dc_power: "DC power",
  ac_power: "AC power",
  mechanical_rotation: "Mechanical",
  airflow: "Airflow",
  fluid_flow: "Fluid",
  pneumatic_air: "Pneumatic",
  thermal: "Thermal",
  digital_signal: "Digital signal",
  analog_signal: "Analog signal",
  serial_comm: "Serial",
  ethernet: "Ethernet",
  mounting: "Mounting",
};

export const MEDIUM_SHORT: Record<Medium, string> = {
  dc_power: "DC",
  ac_power: "AC",
  mechanical_rotation: "MECH",
  airflow: "AIR",
  fluid_flow: "FLU",
  pneumatic_air: "PNE",
  thermal: "THM",
  digital_signal: "DI/O",
  analog_signal: "AI/O",
  serial_comm: "SER",
  ethernet: "ETH",
  mounting: "MNT",
};

/** Token family (`--medium-<x>` colour and `--medium-<x>-dash`) used to draw a medium. */
const MEDIUM_TOKEN: Record<Medium, string> = {
  dc_power: "dc-power",
  ac_power: "ac-power",
  mechanical_rotation: "mechanical",
  airflow: "air",
  fluid_flow: "fluid",
  pneumatic_air: "air",
  thermal: "thermal",
  digital_signal: "signal",
  analog_signal: "signal",
  serial_comm: "data",
  ethernet: "data",
  mounting: "mechanical",
};

export function isMedium(value: string): value is Medium {
  return (MEDIA as readonly string[]).includes(value);
}

export function mediumToken(medium: string): string {
  return isMedium(medium) ? MEDIUM_TOKEN[medium] : "mechanical";
}

export function mediumColor(medium: string): string {
  return `var(--medium-${mediumToken(medium)})`;
}

export function mediumDash(medium: string): string {
  return `var(--medium-${mediumToken(medium)}-dash)`;
}

export function mediumLabel(medium: string): string {
  return isMedium(medium) ? MEDIUM_LABEL[medium] : medium;
}

/** Media where a nominal-range mismatch is physically dangerous (ports.py SAFETY_MEDIA). */
export const SAFETY_MEDIA: Medium[] = ["dc_power", "ac_power", "fluid_flow"];

/** Media whose compatibility tags are informational only (ports.py generic_medium). */
export const GENERIC_TAG_MEDIA = new Set<string>(["analog_signal", "digital_signal", "ethernet", "serial_comm", "data"]);

/** ports.py only allows identical media; engineers can relax cells in the matrix editor. */
export function defaultMatrix(): Record<Medium, Record<Medium, Verdict>> {
  const matrix = {} as Record<Medium, Record<Medium, Verdict>>;
  for (const from of MEDIA) {
    const row = {} as Record<Medium, Verdict>;
    for (const to of MEDIA) row[to] = from === to ? "allow" : "deny";
    matrix[from] = row;
  }
  return matrix;
}

const ANALOG_WIDENING = new Set(["voltage", "current", "pressure", "temperature", "vibration", "airflow"]);
const DIGITAL_GENERIC = new Set(["boolean_state", "rpm", "data"]);

/** Returns null when incompatible, otherwise a list of warnings (possibly empty). Mirrors ports.py. */
export function quantityCompatible(medium: string, fromQ: string, toQ: string): string[] | null {
  if (fromQ === toQ) return [];
  switch (medium) {
    case "analog_signal":
      if (toQ === "data" || ANALOG_WIDENING.has(fromQ)) {
        return [`Quantity ${fromQ} → ${toQ} over an analog channel; verify scaling in the PLC tag map.`];
      }
      return null;
    case "digital_signal":
      if (DIGITAL_GENERIC.has(fromQ) && DIGITAL_GENERIC.has(toQ)) {
        return [`Digital mapping ${fromQ} → ${toQ}; confirm the input module supports pulse/boolean mode.`];
      }
      return null;
    case "mechanical_rotation":
      return fromQ === "rpm" && toQ === "rpm" ? [] : null;
    case "dc_power":
      return ["voltage", "current"].includes(fromQ) && ["voltage", "current"].includes(toQ) ? [] : null;
    case "airflow":
      return fromQ === "airflow" && toQ === "airflow" ? [] : null;
    case "fluid_flow":
      return ["data", "pressure"].includes(fromQ) && ["data", "pressure"].includes(toQ) ? [] : null;
    case "thermal":
      return fromQ === "temperature" && toQ === "temperature" ? [] : null;
    case "mounting":
      return ["physical_mount", "vibration"].includes(fromQ) && ["physical_mount", "vibration"].includes(toQ) ? [] : null;
    case "serial_comm":
    case "ethernet":
      return fromQ === "data" && toQ === "data" ? [] : null;
    default:
      return null;
  }
}

const UNIT: Record<string, string> = { voltage: "V", current: "A", pressure: "psi", temperature: "°C", rpm: "rpm", airflow: "CFM" };

export function unitFor(quantity: string): string {
  return UNIT[quantity] ?? "";
}

export function formatRange(range: { min?: number | null | undefined; max?: number | null | undefined } | undefined, quantity: string): string | null {
  const min = range?.min ?? null;
  const max = range?.max ?? null;
  if (min === null && max === null) return null;
  const unit = unitFor(quantity);
  const u = unit ? ` ${unit}` : "";
  if (min !== null && max !== null) return `${min}–${max}${u}`;
  if (min !== null) return `≥ ${min}${u}`;
  return `≤ ${max}${u}`;
}
