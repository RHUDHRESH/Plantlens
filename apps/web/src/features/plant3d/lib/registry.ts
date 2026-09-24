/**
 * Component model registry (pure data — no three/React imports so it can be unit-tested and used
 * by light-weight chrome without pulling the 3D chunk).
 *
 * Every equipment kind declares its default footprint in METRES (width along X, depth along Z,
 * height along Y). Parametric models are built to that size; imported GLB models are normalised
 * to it (see glbManifest.ts).
 */

export const MODEL_KINDS = [
  "induction_motor",
  "pump_set",
  "fan_blower",
  "vfd_cabinet",
  "battery_rack",
  "pv_array",
  "dc_distribution",
  "charge_controller",
  "transformer_dry",
  "transformer_oil",
  "control_valve",
  "tank",
  "heat_exchanger",
  "screw_compressor",
  "conveyor",
  "luminaire",
  "plc_cabinet",
  "enclosure",
  "instrument",
] as const;

export type ModelKind = (typeof MODEL_KINDS)[number];

export interface Footprint {
  /** X extent, metres */
  w: number;
  /** Z extent, metres */
  d: number;
  /** Y extent (height), metres */
  h: number;
}

export interface ModelKindInfo {
  kind: ModelKind;
  label: string;
  footprint: Footprint;
}

const INFO: Record<ModelKind, Omit<ModelKindInfo, "kind">> = {
  induction_motor: { label: "TEFC induction motor", footprint: { w: 0.78, d: 0.4, h: 0.5 } },
  pump_set: { label: "Centrifugal pump set", footprint: { w: 1.75, d: 0.62, h: 0.78 } },
  fan_blower: { label: "Centrifugal fan", footprint: { w: 1.9, d: 1.1, h: 1.5 } },
  vfd_cabinet: { label: "Drive cabinet (VFD / inverter)", footprint: { w: 0.6, d: 0.5, h: 2.1 } },
  battery_rack: { label: "Battery rack", footprint: { w: 0.62, d: 0.62, h: 1.72 } },
  pv_array: { label: "PV array", footprint: { w: 3.55, d: 3.25, h: 2.05 } },
  dc_distribution: { label: "DC distribution board", footprint: { w: 0.8, d: 0.4, h: 1.9 } },
  charge_controller: { label: "MPPT charge controller", footprint: { w: 0.5, d: 0.35, h: 1.6 } },
  transformer_dry: { label: "Dry-type transformer", footprint: { w: 1.4, d: 0.8, h: 1.65 } },
  transformer_oil: { label: "Oil-immersed transformer", footprint: { w: 1.9, d: 1.4, h: 2.1 } },
  control_valve: { label: "Control valve", footprint: { w: 1.2, d: 0.45, h: 1.3 } },
  tank: { label: "Vertical tank", footprint: { w: 1.7, d: 1.7, h: 3.4 } },
  heat_exchanger: { label: "Shell & tube heat exchanger", footprint: { w: 3.2, d: 0.9, h: 1.3 } },
  screw_compressor: { label: "Screw compressor package", footprint: { w: 2.1, d: 1.1, h: 1.7 } },
  conveyor: { label: "Belt conveyor", footprint: { w: 4.2, d: 1.0, h: 1.2 } },
  luminaire: { label: "LED luminaire", footprint: { w: 0.8, d: 0.6, h: 2.6 } },
  plc_cabinet: { label: "PLC cabinet", footprint: { w: 0.8, d: 0.5, h: 2.1 } },
  enclosure: { label: "Enclosure", footprint: { w: 0.6, d: 0.4, h: 1.55 } },
  instrument: { label: "Field instrument", footprint: { w: 0.35, d: 0.35, h: 1.35 } },
};

export function isModelKind(value: unknown): value is ModelKind {
  return typeof value === "string" && (MODEL_KINDS as readonly string[]).includes(value);
}

export function listModelKinds(): ModelKindInfo[] {
  return MODEL_KINDS.map((kind) => ({ kind, ...INFO[kind] }));
}

export function modelKindInfo(kind: ModelKind): ModelKindInfo {
  return { kind, ...INFO[kind] };
}

export function footprintFor(kind: ModelKind, scale = 1): Footprint {
  const f = INFO[kind].footprint;
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return { w: f.w * s, d: f.d * s, h: f.h * s };
}

/** `coords_3d.model` names used in plant.json → kind. `box` is deliberately generic (resolved by type). */
const MODEL_ALIASES: Record<string, ModelKind | null> = {
  solar_panel: "pv_array",
  pv: "pv_array",
  battery_box: "battery_rack",
  battery: "battery_rack",
  busbar_box: "dc_distribution",
  busbar: "dc_distribution",
  inverter_box: "vfd_cabinet",
  vfd: "vfd_cabinet",
  inverter: "vfd_cabinet",
  motor_simple: "induction_motor",
  motor: "induction_motor",
  pump: "pump_set",
  fan: "fan_blower",
  blower: "fan_blower",
  transformer: "transformer_dry",
  valve: "control_valve",
  vessel: "tank",
  compressor: "screw_compressor",
  lamp: "luminaire",
  plc: "plc_cabinet",
  box: null,
  generic: null,
};

/** Ordered (pattern, kind) rules for plant asset `type` strings. First match wins. */
const TYPE_RULES: Array<[RegExp, ModelKind]> = [
  [/^source\.(solar|pv)/, "pv_array"],
  [/^storage\.batter/, "battery_rack"],
  [/^control\.charge_controller|mppt/, "charge_controller"],
  [/^control\.(plc|rtu|controller)/, "plc_cabinet"],
  [/transformer_oil|oil_transformer/, "transformer_oil"],
  [/transformer/, "transformer_dry"],
  [/^drive\.|vfd|inverter/, "vfd_cabinet"],
  [/pump/, "pump_set"],
  [/fan|blower/, "fan_blower"],
  [/compressor/, "screw_compressor"],
  [/conveyor/, "conveyor"],
  [/motor/, "induction_motor"],
  [/lamp|light|luminaire/, "luminaire"],
  [/valve/, "control_valve"],
  [/heat_exchanger|exchanger|\.hx\b|cooler/, "heat_exchanger"],
  [/tank|vessel|silo/, "tank"],
  [/^distribution\.|busbar|dc_bus|switchboard|breaker/, "dc_distribution"],
  [/^sensor\.|^instrument\.|transmitter/, "instrument"],
  [/^control\./, "plc_cabinet"],
];

export function kindForAssetType(assetType: string | null | undefined): ModelKind | null {
  if (!assetType) return null;
  const t = assetType.toLowerCase();
  for (const [re, kind] of TYPE_RULES) if (re.test(t)) return kind;
  return null;
}

export function kindForModelName(model: string | null | undefined): ModelKind | null {
  if (!model) return null;
  const m = model.toLowerCase();
  if (isModelKind(m)) return m;
  return MODEL_ALIASES[m] ?? null;
}

/**
 * Resolve the model kind for an asset. A specific `coords_3d.model` name wins, then the asset
 * type, then the generic enclosure.
 */
export function resolveModelKind(input: { model?: string | null; assetType?: string | null }): ModelKind {
  return kindForModelName(input.model) ?? kindForAssetType(input.assetType) ?? "enclosure";
}
