import type { CompatibilityResult } from "../../app/schemas/plantAssembly";
import type { ComponentTemplate, Port } from "./componentLibraryTypes";

const SAFETY_MEDIA = new Set(["dc_power", "ac_power", "fluid_flow"]);

function canSource(port: Port): boolean {
  return port.direction === "output" || port.direction === "bidirectional";
}

function canSink(port: Port): boolean {
  return port.direction === "input" || port.direction === "bidirectional";
}

function rangesOverlap(
  fromMin: number | null | undefined,
  fromMax: number | null | undefined,
  toMin: number | null | undefined,
  toMax: number | null | undefined,
): { overlaps: boolean; bothDefined: boolean } {
  const fromVals = [fromMin, fromMax].filter((v) => v != null);
  const toVals = [toMin, toMax].filter((v) => v != null);
  if (!fromVals.length || !toVals.length) return { overlaps: true, bothDefined: false };
  const fLo = fromMin ?? fromMax!;
  const fHi = fromMax ?? fromMin!;
  const tLo = toMin ?? toMax!;
  const tHi = toMax ?? toMin!;
  return { overlaps: fLo <= tHi && tLo <= fHi, bothDefined: true };
}

function quantityCompatible(fromMedium: string, fromQ: string, toQ: string, warnings: string[]): boolean {
  if (fromQ === toQ) return true;
  if (fromMedium === "analog_signal") {
    if (toQ === "data" || ["voltage", "current", "pressure", "temperature", "vibration", "airflow"].includes(fromQ)) {
      warnings.push(`Quantity kind ${fromQ} -> ${toQ} via analog channel; verify PLC scaling.`);
      return true;
    }
    return false;
  }
  if (fromMedium === "digital_signal") {
    if (["boolean_state", "rpm", "data"].includes(fromQ) && ["boolean_state", "rpm", "data"].includes(toQ)) {
      return true;
    }
    return false;
  }
  if (fromMedium === "mechanical_rotation") return fromQ === "rpm" && toQ === "rpm";
  if (fromMedium === "dc_power") return ["voltage", "current"].includes(fromQ) && ["voltage", "current"].includes(toQ);
  if (fromMedium === "airflow") return fromQ === "airflow" && toQ === "airflow";
  if (fromMedium === "fluid_flow") return ["data", "pressure"].includes(fromQ) && ["data", "pressure"].includes(toQ);
  if (fromMedium === "thermal") return fromQ === "temperature" && toQ === "temperature";
  return false;
}

export function checkPortCompatibilityLocal(
  fromComponent: ComponentTemplate,
  fromPortId: string,
  toComponent: ComponentTemplate,
  toPortId: string,
): CompatibilityResult {
  const fromPort = fromComponent.ports.find((p) => p.port_id === fromPortId);
  const toPort = toComponent.ports.find((p) => p.port_id === toPortId);
  const warnings: string[] = [];
  const required_adapters: string[] = [];

  if (!fromPort || !toPort) {
    return {
      compatible: false,
      severity: "error",
      reason: "Unknown port reference.",
      warnings: [],
      required_adapters: [],
    };
  }

  const base = {
    from_medium: fromPort.medium,
    to_medium: toPort.medium,
    from_quantity_kind: fromPort.quantity_kind,
    to_quantity_kind: toPort.quantity_kind,
  };

  if (!canSource(fromPort)) {
    return { compatible: false, severity: "error", reason: `Source port '${fromPort.port_id}' cannot drive a connection.`, warnings, required_adapters, ...base };
  }
  if (!canSink(toPort)) {
    return { compatible: false, severity: "error", reason: `Target port '${toPort.port_id}' cannot receive a connection.`, warnings, required_adapters, ...base };
  }
  if (fromPort.direction === "output" && toPort.direction === "output" && fromPort.medium !== "mounting") {
    return { compatible: false, severity: "error", reason: "Output-to-output connections are invalid.", warnings, required_adapters, ...base };
  }
  if (fromPort.direction === "input" && toPort.direction === "input") {
    return { compatible: false, severity: "error", reason: "Input-to-input connections are invalid.", warnings, required_adapters, ...base };
  }
  if (fromPort.medium !== toPort.medium) {
    return {
      compatible: false,
      severity: "error",
      reason: `Incompatible media: ${fromPort.medium} cannot connect to ${toPort.medium}.`,
      warnings,
      required_adapters,
      ...base,
    };
  }
  if (!quantityCompatible(fromPort.medium, fromPort.quantity_kind, toPort.quantity_kind, warnings)) {
    return {
      compatible: false,
      severity: "error",
      reason: `Incompatible quantity kinds: ${fromPort.quantity_kind} -> ${toPort.quantity_kind}.`,
      warnings,
      required_adapters,
      ...base,
    };
  }

  const { overlaps, bothDefined } = rangesOverlap(
    fromPort.nominal_range?.min,
    fromPort.nominal_range?.max,
    toPort.nominal_range?.min,
    toPort.nominal_range?.max,
  );

  if (bothDefined && !overlaps && SAFETY_MEDIA.has(fromPort.medium)) {
    return {
      compatible: false,
      severity: "error",
      reason: "Nominal operating ranges do not overlap.",
      warnings,
      required_adapters,
      ...base,
    };
  }

  return {
    compatible: true,
    severity: warnings.length ? "warning" : "ok",
    reason: warnings.length ? "Ports are compatible with warnings." : "Ports are compatible.",
    warnings,
    required_adapters,
    ...base,
  };
}

export function inferConnectionKind(medium: string): "power" | "signal" | "mechanical" | "airflow" | "fluid" | "mounting" | "data" {
  switch (medium) {
    case "dc_power":
    case "ac_power":
      return "power";
    case "analog_signal":
    case "digital_signal":
      return "signal";
    case "mechanical_rotation":
      return "mechanical";
    case "airflow":
      return "airflow";
    case "fluid_flow":
      return "fluid";
    case "mounting":
      return "mounting";
    default:
      return "data";
  }
}