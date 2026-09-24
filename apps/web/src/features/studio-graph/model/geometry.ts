/** Pure canvas geometry: grid snapping, Figma-style alignment guides, align/distribute. */
import type { XY } from "./assemblyOps";

export const GRID = 16;

export interface Rect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function snap(value: number, grid = GRID): number {
  return Math.round(value / grid) * grid;
}

export function snapPoint(p: XY, grid = GRID): XY {
  return { x: snap(p.x, grid), y: snap(p.y, grid) };
}

export function boundsOf(rects: readonly Rect[]): Rect | null {
  if (!rects.length) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { id: "bounds", x, y, width: right - x, height: bottom - y };
}

export interface Guide {
  orientation: "vertical" | "horizontal";
  /** x for vertical guides, y for horizontal ones (flow coordinates). */
  pos: number;
  from: number;
  to: number;
}

export interface GuideResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

const xs = (r: Rect) => [r.x, r.x + r.width / 2, r.x + r.width];
const ys = (r: Rect) => [r.y, r.y + r.height / 2, r.y + r.height];

/**
 * Snap `moving` to the nearest edge/centre line of `others` within `threshold` on each axis
 * independently, and return the guides to draw after the snap is applied.
 */
export function computeAlignment(moving: Rect, others: readonly Rect[], threshold: number): GuideResult {
  let bestX: number | null = null;
  let bestY: number | null = null;
  for (const o of others) {
    for (const mx of xs(moving)) for (const ox of xs(o)) {
      const d = ox - mx;
      if (Math.abs(d) <= threshold && (bestX === null || Math.abs(d) < Math.abs(bestX))) bestX = d;
    }
    for (const my of ys(moving)) for (const oy of ys(o)) {
      const d = oy - my;
      if (Math.abs(d) <= threshold && (bestY === null || Math.abs(d) < Math.abs(bestY))) bestY = d;
    }
  }
  const dx = bestX ?? 0;
  const dy = bestY ?? 0;
  const snapped = { ...moving, x: moving.x + dx, y: moving.y + dy };
  const guides: Guide[] = [];
  const EPS = 0.5;
  if (bestX !== null) {
    for (const line of xs(snapped)) {
      const hits = others.filter((o) => xs(o).some((ox) => Math.abs(ox - line) < EPS));
      if (!hits.length) continue;
      const all = [snapped, ...hits];
      guides.push({ orientation: "vertical", pos: line, from: Math.min(...all.map((r) => r.y)), to: Math.max(...all.map((r) => r.y + r.height)) });
    }
  }
  if (bestY !== null) {
    for (const line of ys(snapped)) {
      const hits = others.filter((o) => ys(o).some((oy) => Math.abs(oy - line) < EPS));
      if (!hits.length) continue;
      const all = [snapped, ...hits];
      guides.push({ orientation: "horizontal", pos: line, from: Math.min(...all.map((r) => r.x)), to: Math.max(...all.map((r) => r.x + r.width)) });
    }
  }
  return { dx, dy, guides };
}

/** Only rects near the moving one matter for guides (keeps 200-node drags cheap and calm). */
export function nearbyRects(moving: Rect, others: readonly Rect[], radius: number): Rect[] {
  return others.filter(
    (o) =>
      o.x < moving.x + moving.width + radius &&
      o.x + o.width > moving.x - radius &&
      o.y < moving.y + moving.height + radius &&
      o.y + o.height > moving.y - radius,
  );
}

export type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

export function alignRects(rects: readonly Rect[], mode: AlignMode): Record<string, XY> {
  const b = boundsOf(rects);
  const out: Record<string, XY> = {};
  if (!b || rects.length < 2) return out;
  for (const r of rects) {
    let { x, y } = r;
    if (mode === "left") x = b.x;
    if (mode === "right") x = b.x + b.width - r.width;
    if (mode === "hcenter") x = b.x + b.width / 2 - r.width / 2;
    if (mode === "top") y = b.y;
    if (mode === "bottom") y = b.y + b.height - r.height;
    if (mode === "vcenter") y = b.y + b.height / 2 - r.height / 2;
    out[r.id] = { x: Math.round(x), y: Math.round(y) };
  }
  return out;
}

export function overlaps(a: Rect, b: Rect, margin = 0): boolean {
  return a.x < b.x + b.width + margin && a.x + a.width + margin > b.x && a.y < b.y + b.height + margin && a.y + a.height + margin > b.y;
}

/**
 * Nearest spot to `want` (searching outward in rings of `step`) where a `width`×`height` rect
 * does not overlap any of `others` (with `margin`). Keeps click/Enter-to-add from stacking nodes.
 */
export function findFreeSpot(
  want: XY,
  size: { width: number; height: number },
  others: readonly Rect[],
  step = GRID * 2,
  margin = GRID,
  maxRings = 24,
): XY {
  const free = (p: XY) => !others.some((o) => overlaps({ id: "", x: p.x, y: p.y, ...size }, o, margin));
  if (free(want)) return want;
  for (let ring = 1; ring <= maxRings; ring += 1) {
    const candidates: XY[] = [];
    for (let i = -ring; i <= ring; i += 1) {
      candidates.push({ x: want.x + i * step, y: want.y - ring * step }, { x: want.x + i * step, y: want.y + ring * step });
      if (i !== -ring && i !== ring) candidates.push({ x: want.x - ring * step, y: want.y + i * step }, { x: want.x + ring * step, y: want.y + i * step });
    }
    candidates.sort((a, z) => Math.hypot(a.x - want.x, a.y - want.y) - Math.hypot(z.x - want.x, z.y - want.y));
    const hit = candidates.find(free);
    if (hit) return hit;
  }
  return want;
}

/** Equal gaps between neighbours, keeping the outermost two fixed. */
export function distributeRects(rects: readonly Rect[], axis: "horizontal" | "vertical"): Record<string, XY> {
  const out: Record<string, XY> = {};
  if (rects.length < 3) return out;
  const horizontal = axis === "horizontal";
  const sorted = [...rects].sort((a, z) => (horizontal ? a.x - z.x : a.y - z.y));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const span = horizontal ? last.x + last.width - first.x : last.y + last.height - first.y;
  const total = sorted.reduce((s, r) => s + (horizontal ? r.width : r.height), 0);
  const gap = (span - total) / (sorted.length - 1);
  let cursor = horizontal ? first.x : first.y;
  for (const r of sorted) {
    out[r.id] = horizontal ? { x: Math.round(cursor), y: r.y } : { x: r.x, y: Math.round(cursor) };
    cursor += (horizontal ? r.width : r.height) + gap;
  }
  return out;
}
