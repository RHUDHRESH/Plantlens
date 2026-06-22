import type { MapZoomBand } from "../operational-map";
import type { Map3DNode } from "../ops3d/map3dTypes";

export interface Bounds3D {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface CameraPose3D {
  position: [number, number, number];
  target: [number, number, number];
  distance: number;
}

export interface SceneFit3D {
  bounds: Bounds3D;
  center: Point3D;
  radius: number;
  cameraPose: CameraPose3D;
}

const FALLBACK_BOUNDS: Bounds3D = {
  minX: -4,
  minY: 0,
  minZ: -4,
  maxX: 4,
  maxY: 2,
  maxZ: 4,
};

const MIN_RADIUS = 2;

function isValidCoord(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readNodePosition(node: Map3DNode): Point3D | null {
  const { x, y, z } = node.position;
  if (!isValidCoord(x) || !isValidCoord(y) || !isValidCoord(z)) return null;
  return { x, y, z };
}

export function boundsFrom3DNodes(nodes: Map3DNode[]): Bounds3D {
  const positioned = nodes.map(readNodePosition).filter((p): p is Point3D => p != null);
  if (!positioned.length) return { ...FALLBACK_BOUNDS };

  const xs = positioned.map((p) => p.x);
  const ys = positioned.map((p) => p.y);
  const zs = positioned.map((p) => p.z);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    minZ: Math.min(...zs),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
    maxZ: Math.max(...zs),
  };
}

export function centerFromBounds3D(bounds: Bounds3D): Point3D {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2,
  };
}

export function radiusFromBounds3D(bounds: Bounds3D): number {
  const dx = bounds.maxX - bounds.minX;
  const dy = bounds.maxY - bounds.minY;
  const dz = bounds.maxZ - bounds.minZ;
  const diagonal = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return Math.max(diagonal / 2, MIN_RADIUS);
}

function cameraPoseFromCenter(center: Point3D, radius: number): CameraPose3D {
  const distance = radius * 2.2;
  return {
    target: [center.x, center.y, center.z],
    position: [
      center.x + radius * 1.2,
      center.y + radius * 0.9 + 1.2,
      center.z + radius * 1.2,
    ],
    distance,
  };
}

export function fitSceneToNodes(nodes: Map3DNode[]): SceneFit3D {
  const bounds = boundsFrom3DNodes(nodes);
  const center = centerFromBounds3D(bounds);
  const radius = radiusFromBounds3D(bounds);
  const cameraPose = cameraPoseFromCenter(center, radius);
  return { bounds, center, radius, cameraPose };
}

export function focusAssetPose3D(
  point: Point3D,
  radius = MIN_RADIUS,
  mode: "asset" | "root" | "plant" = "asset",
): CameraPose3D {
  const safeRadius = Math.max(isValidCoord(radius) ? radius : MIN_RADIUS, MIN_RADIUS);
  const target: [number, number, number] = [point.x, point.y, point.z];

  if (mode === "plant") {
    return cameraPoseFromCenter(point, safeRadius);
  }

  const distanceFactor = mode === "asset" ? 1.2 : 1.6;
  const offsetFactor = mode === "asset" ? 0.55 : 0.85;
  const yLift = mode === "asset" ? 0.8 : 1.0;
  const distance = safeRadius * distanceFactor;

  return {
    target,
    position: [
      point.x + safeRadius * offsetFactor,
      point.y + safeRadius * offsetFactor * 0.75 + yLift,
      point.z + safeRadius * offsetFactor,
    ],
    distance: Number.isFinite(distance) ? distance : MIN_RADIUS * 2.2,
  };
}

export function getSceneScaleBand(distance: number, fitDistance: number): MapZoomBand {
  if (!Number.isFinite(distance) || !Number.isFinite(fitDistance) || fitDistance <= 0) {
    return "plant";
  }
  if (distance >= fitDistance * 0.9) return "plant";
  if (distance >= fitDistance * 0.55) return "area";
  if (distance >= fitDistance * 0.28) return "asset";
  return "component";
}

export function findNodePosition3D(nodes: Map3DNode[], assetId: string): Point3D | null {
  const node = nodes.find((n) => n.id === assetId);
  if (!node) return null;
  return readNodePosition(node);
}

export function distanceBetweenPoints(a: Point3D, b: Point3D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return Number.isFinite(dist) ? dist : 0;
}

export function scaleFromDistance(distance: number, fitDistance: number): number {
  if (!Number.isFinite(distance) || distance <= 0 || !Number.isFinite(fitDistance) || fitDistance <= 0) {
    return 1;
  }
  return fitDistance / distance;
}