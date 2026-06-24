/**
 * Plant Layout Studio types — drag-and-drop plant builder (Screen 05).
 * All data is model draft only; no live plant write path.
 */

export type LayoutBlockKind =
  | "motor"
  | "fan"
  | "blower"
  | "sensor"
  | "power"
  | "relay"
  | "plc"
  | "group";

export type LayoutConnectionKind =
  | "power"
  | "process"
  | "signal"
  | "control"
  | "dependency";

export type LayoutValidationStatus = "valid" | "warning" | "error" | "unknown";

export type LayoutMode = "select" | "place" | "connect" | "pan";

export interface BlockPaletteItem {
  id: string;
  label: string;
  typeId: string;
  kind: LayoutBlockKind;
  category: "motors" | "air" | "power" | "sensors" | "control" | "groups";
  geometryRef: string;
  description: string;
}

export interface LayoutBinding {
  signal: string;
  status: "bound" | "missing" | "optional" | "derived";
  source?: string;
}

export interface LayoutBlockModel {
  id: string;
  instanceId: string;
  label: string;
  typeId: string;
  kind: LayoutBlockKind;
  x: number;
  y: number;
  z: number;
  status: "normal" | "warning" | "critical" | "unknown" | "draft";
  bindings: LayoutBinding[];
}

export interface LayoutConnectionModel {
  id: string;
  sourceId: string;
  targetId: string;
  kind: LayoutConnectionKind;
  label: string;
  status: "valid" | "warning" | "error" | "draft";
}

export interface LayoutValidationIssue {
  id: string;
  severity: "info" | "warning" | "error";
  message: string;
  blockId?: string;
  connectionId?: string;
}

export const BLOCK_SIZES: Record<LayoutBlockKind, { w: number; h: number }> = {
  motor: { w: 140, h: 64 },
  fan: { w: 130, h: 60 },
  blower: { w: 130, h: 60 },
  sensor: { w: 120, h: 48 },
  power: { w: 140, h: 64 },
  relay: { w: 130, h: 60 },
  plc: { w: 160, h: 72 },
  group: { w: 180, h: 100 },
};