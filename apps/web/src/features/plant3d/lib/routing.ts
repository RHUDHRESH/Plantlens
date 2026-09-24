/**
 * Orthogonal cable/pipe routing between two footprints (pure). Routes leave the source footprint
 * on the side facing the target, run along the dominant axis, jog once at the midpoint and enter
 * the target on the facing side — the way trays and pipe racks are actually run.
 */
import type { Vec3 } from "./layout";

export interface RouteEnd {
  /** footprint centre (x, z) */
  center: [number, number];
  /** half extents (hw along X, hd along Z) */
  half: [number, number];
}

export type EdgeMedium = "power" | "signal" | "fluid" | "air" | "mechanical" | "causal";

export function mediumForEdgeType(type: string | undefined): EdgeMedium {
  switch (type) {
    case "signal":
      return "signal";
    case "process":
    case "cooling":
      return "fluid";
    case "mechanical":
      return "mechanical";
    case "causal":
      return "causal";
    default:
      return "power";
  }
}

/** Run height above floor (metres) — cables in a floor tray, pipes on low supports. */
export function routeHeightFor(medium: EdgeMedium): number {
  switch (medium) {
    case "fluid":
      return 0.45;
    case "signal":
      return 0.05;
    default:
      return 0.045;
  }
}

function dedupe(points: Vec3[]): Vec3[] {
  const out: Vec3[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0] - p[0]) < 1e-6 && Math.abs(last[1] - p[1]) < 1e-6 && Math.abs(last[2] - p[2]) < 1e-6) continue;
    out.push(p);
  }
  return out;
}

export function buildOrthogonalRoute(a: RouteEnd, b: RouteEnd, height = 0.07, lane = 0): Vec3[] {
  const [ax, az] = a.center;
  const [bx, bz] = b.center;
  const dx = bx - ax;
  const dz = bz - az;
  const alongX = Math.abs(dx) >= Math.abs(dz);
  if (alongX) {
    const sx = Math.sign(dx) || 1;
    const p0: Vec3 = [ax + sx * a.half[0], height, az + lane];
    const p3: Vec3 = [bx - sx * b.half[0], height, bz + lane];
    if (Math.abs(p0[2] - p3[2]) < 1e-6) return dedupe([p0, p3]);
    const mid = (p0[0] + p3[0]) / 2;
    return dedupe([p0, [mid, height, p0[2]], [mid, height, p3[2]], p3]);
  }
  const sz = Math.sign(dz) || 1;
  const p0: Vec3 = [ax + lane, height, az + sz * a.half[1]];
  const p3: Vec3 = [bx + lane, height, bz - sz * b.half[1]];
  if (Math.abs(p0[0] - p3[0]) < 1e-6) return dedupe([p0, p3]);
  const mid = (p0[2] + p3[2]) / 2;
  return dedupe([p0, [p0[0], height, mid], [p3[0], height, mid], p3]);
}

/** True when every segment of the polyline is parallel to a world axis. */
export function isOrthogonal(points: Vec3[]): boolean {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const changed = [0, 1, 2].filter((k) => Math.abs(a[k]! - b[k]!) > 1e-6).length;
    if (changed > 1) return false;
  }
  return true;
}

/**
 * Replace each interior corner of a polyline with a quadratic arc of (at most) `radius`, sampled
 * with `steps` points — cables and pipes bend, they don't kink.
 */
export function filletPolyline(points: Vec3[], radius = 0.25, steps = 6): Vec3[] {
  if (points.length < 3) return points.slice();
  const out: Vec3[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const p0 = points[i - 1]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const d0 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    const d1 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
    const r = Math.min(radius, d0 / 2, d1 / 2);
    if (r < 1e-4) {
      out.push(p1);
      continue;
    }
    const a: Vec3 = [p1[0] + ((p0[0] - p1[0]) * r) / d0, p1[1] + ((p0[1] - p1[1]) * r) / d0, p1[2] + ((p0[2] - p1[2]) * r) / d0];
    const b: Vec3 = [p1[0] + ((p2[0] - p1[0]) * r) / d1, p1[1] + ((p2[1] - p1[1]) * r) / d1, p1[2] + ((p2[2] - p1[2]) * r) / d1];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const u = 1 - t;
      out.push([
        u * u * a[0] + 2 * u * t * p1[0] + t * t * b[0],
        u * u * a[1] + 2 * u * t * p1[1] + t * t * b[1],
        u * u * a[2] + 2 * u * t * p1[2] + t * t * b[2],
      ]);
    }
  }
  out.push(points[points.length - 1]!);
  return out;
}

export function polylineLength(points: Vec3[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    len += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return len;
}
