/** Camera poses for the plant view (pure). */
import type { Vec3 } from "./layout";

export type ViewPreset = "iso" | "front" | "top";

export type CameraCommand =
  | { type: "fit"; nonce: number }
  | { type: "preset"; preset: ViewPreset; nonce: number }
  | { type: "focus"; id: string; nonce: number }
  | { type: "zoom"; factor: number; nonce: number };

/** A command without its nonce (distributive over the union). */
export type CameraCommandInput = CameraCommand extends infer C ? (C extends CameraCommand ? Omit<C, "nonce"> : never) : never;

export interface CameraPose {
  position: Vec3;
  target: Vec3;
}

export const PRESET_DIRECTIONS: Record<ViewPreset, Vec3> = {
  iso: [0.72, 0.62, 1.0],
  front: [0, 0.32, 1],
  top: [0, 1, 0.0001],
};

function normalise(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Distance at which a sphere of `radius` fills the view (vertical fov, aspect-aware). */
export function fitDistance(radius: number, fovDeg: number, aspect = 16 / 9, margin = 1.08): number {
  const vfov = (fovDeg * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * Math.max(aspect, 0.2));
  const fov = Math.min(vfov, hfov);
  return (Math.max(radius, 0.5) / Math.sin(fov / 2)) * margin;
}

export function boundsSphere(bounds: { min: Vec3; max: Vec3 }) {
  const center: Vec3 = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  const radius = Math.hypot(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]) / 2;
  return { center, radius };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Smallest camera distance (along `dir`, from `target`) at which all 8 corners of the box are
 * inside the frustum. Exact for a perspective camera — no bounding-sphere slack.
 */
export function fitDistanceForBox(bounds: { min: Vec3; max: Vec3 }, target: Vec3, dirIn: Vec3, fovDeg: number, aspect: number, margin = 1.06): number {
  const dir = normalise(dirIn);
  const vt = Math.tan((fovDeg * Math.PI) / 360);
  const ht = vt * Math.max(aspect, 0.2);
  const forward: Vec3 = [-dir[0], -dir[1], -dir[2]];
  const worldUp: Vec3 = Math.abs(dir[1]) > 0.99 ? [0, 0, -1] : [0, 1, 0];
  const right = normalise(cross(forward, worldUp));
  const up = normalise(cross(right, forward));
  let d = 0.5;
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) {
        const v: Vec3 = [x - target[0], y - target[1], z - target[2]];
        const along = dot(v, dir);
        d = Math.max(d, along + (Math.abs(dot(v, right)) * margin) / ht, along + (Math.abs(dot(v, up)) * margin) / vt);
      }
    }
  }
  return d;
}

export function presetPose(bounds: { min: Vec3; max: Vec3 }, preset: ViewPreset, fovDeg: number, aspect: number): CameraPose {
  const target: Vec3 = [(bounds.min[0] + bounds.max[0]) / 2, Math.min((bounds.max[1] - bounds.min[1]) * 0.3, 0.8), (bounds.min[2] + bounds.max[2]) / 2];
  const dir = normalise(PRESET_DIRECTIONS[preset]);
  const d = fitDistanceForBox(bounds, target, dir, fovDeg, aspect);
  return { target, position: [target[0] + dir[0] * d, target[1] + dir[1] * d, target[2] + dir[2] * d] };
}

/** Focus an asset: keep the current viewing azimuth, clamp elevation to a readable 20–55°. */
export function focusPose(
  asset: { position: Vec3; footprint: { w: number; d: number; h: number } },
  current: CameraPose,
  fovDeg: number,
  aspect: number,
): CameraPose {
  const target: Vec3 = [asset.position[0], asset.position[1] + asset.footprint.h * 0.45, asset.position[2]];
  const r = Math.hypot(asset.footprint.w, asset.footprint.d, asset.footprint.h) / 2;
  const d = Math.max(3.2, fitDistance(r, fovDeg, aspect, 2.6));
  let dx = current.position[0] - current.target[0];
  let dz = current.position[2] - current.target[2];
  const horiz = Math.hypot(dx, dz);
  if (horiz < 1e-3) {
    dx = 0.6;
    dz = 1;
  }
  const az = Math.atan2(dx, dz);
  const dy = current.position[1] - current.target[1];
  const elevation = Math.min(Math.max(Math.atan2(dy, Math.max(horiz, 1e-3)), (20 * Math.PI) / 180), (55 * Math.PI) / 180);
  return {
    target,
    position: [
      target[0] + Math.sin(az) * Math.cos(elevation) * d,
      target[1] + Math.sin(elevation) * d,
      target[2] + Math.cos(az) * Math.cos(elevation) * d,
    ],
  };
}

/** Smooth ease used for the 400 ms camera focus. */
export function easeInOutCubic(t: number): number {
  const x = Math.min(Math.max(t, 0), 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export const CAMERA_FOCUS_MS = 400;
