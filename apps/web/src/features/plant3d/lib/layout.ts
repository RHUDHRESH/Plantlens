/**
 * Plant layout for the 3D view (pure). Turns compiled `map_3d` nodes into placements in metres,
 * three.js Y-up, with footprints so assets never overlap.
 *
 * `coords_3d` in plant.json are schematic *plan* coordinates: (x, y) on the floor plan and z the
 * elevation (the demo microgrid uses y = ±1 to put the two inverters side by side). A bundle that
 * is authored Y-up (all y = 0, z varies) is detected and honoured. Plan units are scaled so the
 * real-size equipment footprints fit with an aisle between them. Assets without coordinates are
 * auto-laid out in tidy rows by area.
 */
import type { Map3DNode } from "../../ops3d/map3dTypes";
import { footprintFor, resolveModelKind, type Footprint, type ModelKind } from "./registry";

export type Vec3 = [number, number, number];

export interface PlacedAsset {
  id: string;
  label: string;
  assetType: string;
  kind: ModelKind;
  modelKey?: string;
  areaId?: string;
  /** world position of the footprint centre on the floor (metres, Y-up) */
  position: Vec3;
  /** rotation about the vertical axis, radians */
  yaw: number;
  footprint: Footprint;
  tags: string[];
  alarms: string[];
}

export interface AreaZone {
  id: string;
  name: string;
  min: [number, number];
  max: [number, number];
}

export interface PlantLayout {
  assets: PlacedAsset[];
  areas: AreaZone[];
  /** plan units → metres factor that was applied to authored coordinates */
  scale: number;
  bounds: { min: Vec3; max: Vec3 };
}

export type AxisConvention = "z_up_plan" | "y_up";

const CLEARANCE_M = 1.2;
const MIN_SCALE = 1;
const MAX_SCALE = 25;

function finite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

export function hasValidPosition(node: Pick<Map3DNode, "position">): boolean {
  const p = node.position as Partial<Map3DNode["position"]> | undefined;
  return !!p && finite(p.x) && finite(p.y) && finite(p.z);
}

/** Plan-y (z = elevation) unless the bundle is clearly authored Y-up (all y = 0, some z ≠ 0). */
export function detectAxisConvention(nodes: Array<Pick<Map3DNode, "position">>): AxisConvention {
  const valid = nodes.filter(hasValidPosition);
  if (!valid.length) return "z_up_plan";
  const allYZero = valid.every((n) => n.position.y === 0);
  const someZ = valid.some((n) => n.position.z !== 0);
  return allYZero && someZ ? "y_up" : "z_up_plan";
}

/** Returns plan (u, v) and elevation for a node under the given convention. */
export function planCoords(node: Pick<Map3DNode, "position">, convention: AxisConvention) {
  const { x, y, z } = node.position;
  return convention === "y_up" ? { u: x, v: z, elev: y } : { u: x, v: -y, elev: z };
}

interface PlanItem {
  u: number;
  v: number;
  footprint: Footprint;
}

/**
 * Smallest scale s (plan units → metres) so every pair of footprints is separated by at least
 * `clearance` metres along X or Z. Clamped to [1, 25].
 */
export function computeLayoutScale(items: PlanItem[], clearance = CLEARANCE_M): number {
  let s = MIN_SCALE;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!;
      const b = items[j]!;
      const du = Math.abs(a.u - b.u);
      const dv = Math.abs(a.v - b.v);
      const needU = (a.footprint.w + b.footprint.w) / 2 + clearance;
      const needV = (a.footprint.d + b.footprint.d) / 2 + clearance;
      const candidates: number[] = [];
      if (du > 1e-6) candidates.push(needU / du);
      if (dv > 1e-6) candidates.push(needV / dv);
      if (!candidates.length) continue; // coincident; auto-layout nudges these
      s = Math.max(s, Math.min(...candidates));
    }
  }
  return Math.min(MAX_SCALE, s);
}

export interface AutoLayoutItem {
  id: string;
  areaId?: string | undefined;
  footprint: Footprint;
}

/**
 * Tidy rows by area: each area is a row along X (assets in given order, `gap` apart), rows are
 * stacked along Z with an aisle. Result is centred on the origin. Returns centre (x, z) per id.
 */
export function autoLayout(
  items: AutoLayoutItem[],
  areaOrder: string[] = [],
  gap = 1.4,
  aisle = 2.6,
): Map<string, [number, number]> {
  const groups = new Map<string, AutoLayoutItem[]>();
  const order = [...areaOrder];
  for (const item of items) {
    const key = item.areaId ?? "__none__";
    if (!groups.has(key)) {
      groups.set(key, []);
      if (!order.includes(key)) order.push(key);
    }
    groups.get(key)!.push(item);
  }
  const out = new Map<string, [number, number]>();
  let z = 0;
  let maxRowWidth = 0;
  const rows: Array<{ items: AutoLayoutItem[]; width: number; z: number }> = [];
  for (const key of order) {
    const row = groups.get(key);
    if (!row?.length) continue;
    const depth = Math.max(...row.map((r) => r.footprint.d));
    const width = row.reduce((acc, r) => acc + r.footprint.w, 0) + gap * (row.length - 1);
    maxRowWidth = Math.max(maxRowWidth, width);
    rows.push({ items: row, width, z: z + depth / 2 });
    z += depth + aisle;
  }
  const totalDepth = Math.max(0, z - aisle);
  for (const row of rows) {
    let x = -row.width / 2;
    for (const item of row.items) {
      out.set(item.id, [x + item.footprint.w / 2, row.z - totalDepth / 2]);
      x += item.footprint.w + gap;
    }
  }
  return out;
}

export interface BuildLayoutOptions {
  areas?: Array<{ id: string; name?: string }>;
  /** extra per-asset info (e.g. from the compiled asset_index): display names, model names */
  assetInfo?: Record<string, { display_name?: string; type?: string; coords_3d?: { model?: string } } | undefined>;
}

export function buildPlantLayout(nodes: Map3DNode[], options: BuildLayoutOptions = {}): PlantLayout {
  const convention = detectAxisConvention(nodes);
  const base = nodes.map((node) => {
    const info = options.assetInfo?.[node.id];
    const assetType = node.asset_type && node.asset_type !== "unknown" ? node.asset_type : info?.type ?? "unknown";
    const modelKey = node.model_key ?? info?.coords_3d?.model;
    const kind = resolveModelKind({ model: modelKey ?? null, assetType });
    const footprint = footprintFor(kind, node.scale ?? 1);
    const yawDeg = node.rotation ? (convention === "y_up" ? node.rotation.y : node.rotation.z) : 0;
    return { node, info, assetType, modelKey, kind, footprint, yaw: ((yawDeg || 0) * Math.PI) / 180 };
  });

  const positioned = base.filter((b) => hasValidPosition(b.node));
  const planItems = positioned.map((b) => ({ ...planCoords(b.node, convention), footprint: b.footprint, id: b.node.id }));
  const scale = computeLayoutScale(planItems);

  const centres = new Map<string, { x: number; z: number; y: number }>();
  if (planItems.length) {
    const us = planItems.map((p) => p.u * scale);
    const vs = planItems.map((p) => p.v * scale);
    const cu = (Math.min(...us) + Math.max(...us)) / 2;
    const cv = (Math.min(...vs) + Math.max(...vs)) / 2;
    for (const p of planItems) centres.set(p.id, { x: p.u * scale - cu, z: p.v * scale - cv, y: Math.max(0, p.elev) });
  }

  const missing = base.filter((b) => !centres.has(b.node.id));
  if (missing.length) {
    const areaOrder = (options.areas ?? []).map((a) => a.id);
    const auto = autoLayout(
      missing.map((b) => ({ id: b.node.id, areaId: b.node.area_id, footprint: b.footprint })),
      areaOrder,
    );
    // Place the auto rows beyond the authored ones (if any) so they never collide.
    let offsetZ = 0;
    if (centres.size) {
      const maxZ = Math.max(...[...centres.entries()].map(([id, c]) => c.z + (base.find((b) => b.node.id === id)!.footprint.d / 2)));
      const autoMinZ = Math.min(...missing.map((b) => auto.get(b.node.id)![1] - b.footprint.d / 2));
      offsetZ = maxZ + 3 - autoMinZ;
    }
    for (const b of missing) {
      const [x, z] = auto.get(b.node.id)!;
      centres.set(b.node.id, { x, z: z + offsetZ, y: 0 });
    }
  }

  const assets: PlacedAsset[] = base.map((b) => {
    const c = centres.get(b.node.id)!;
    const placed: PlacedAsset = {
      id: b.node.id,
      label: b.node.label || b.info?.display_name || b.node.id,
      assetType: b.assetType,
      kind: b.kind,
      position: [round(c.x), round(c.y), round(c.z)],
      yaw: b.yaw,
      footprint: b.footprint,
      tags: b.node.tags ?? [],
      alarms: b.node.alarms ?? [],
    };
    if (b.modelKey) placed.modelKey = b.modelKey;
    if (b.node.area_id) placed.areaId = b.node.area_id;
    return placed;
  });

  return { assets, areas: areaZones(assets, options.areas), scale, bounds: layoutBounds(assets) };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Axis-aligned footprint rectangle for an asset (yaw of 90° swaps w/d). */
export function footprintRect(a: Pick<PlacedAsset, "position" | "footprint" | "yaw">) {
  const quarter = Math.round(a.yaw / (Math.PI / 2)) % 2 !== 0;
  const hw = (quarter ? a.footprint.d : a.footprint.w) / 2;
  const hd = (quarter ? a.footprint.w : a.footprint.d) / 2;
  return { minX: a.position[0] - hw, maxX: a.position[0] + hw, minZ: a.position[2] - hd, maxZ: a.position[2] + hd, hw, hd };
}

export function areaZones(assets: PlacedAsset[], areas: Array<{ id: string; name?: string }> = [], pad = 0.6): AreaZone[] {
  const ids = [...new Set(assets.map((a) => a.areaId).filter((x): x is string => !!x))];
  return ids.map((id) => {
    const members = assets.filter((a) => a.areaId === id).map(footprintRect);
    return {
      id,
      name: areas.find((a) => a.id === id)?.name ?? id,
      min: [Math.min(...members.map((m) => m.minX)) - pad, Math.min(...members.map((m) => m.minZ)) - pad],
      max: [Math.max(...members.map((m) => m.maxX)) + pad, Math.max(...members.map((m) => m.maxZ)) + pad],
    };
  });
}

export function layoutBounds(assets: PlacedAsset[]): { min: Vec3; max: Vec3 } {
  if (!assets.length) return { min: [-4, 0, -4], max: [4, 2, 4] };
  const rects = assets.map((a) => ({ ...footprintRect(a), top: a.position[1] + a.footprint.h }));
  return {
    min: [Math.min(...rects.map((r) => r.minX)), 0, Math.min(...rects.map((r) => r.minZ))],
    max: [Math.max(...rects.map((r) => r.maxX)), Math.max(...rects.map((r) => r.top)), Math.max(...rects.map((r) => r.maxZ))],
  };
}
