import { describe, expect, it } from "vitest";
import type { Map3DNode } from "../../ops3d/map3dTypes";
import {
  boundsFrom3DNodes,
  centerFromBounds3D,
  findNodePosition3D,
  fitSceneToNodes,
  focusAssetPose3D,
  getSceneScaleBand,
  radiusFromBounds3D,
} from "../sceneMath3D";

function node(id: string, x: number, y: number, z: number): Map3DNode {
  return {
    id,
    label: id,
    asset_type: "generic",
    position: { x, y, z },
    status_binding: `asset_status.${id}`,
  };
}

describe("boundsFrom3DNodes", () => {
  it("returns fallback bounds for empty nodes", () => {
    const bounds = boundsFrom3DNodes([]);
    expect(bounds).toEqual({
      minX: -4,
      minY: 0,
      minZ: -4,
      maxX: 4,
      maxY: 2,
      maxZ: 4,
    });
  });

  it("computes bounds from valid node positions", () => {
    const bounds = boundsFrom3DNodes([
      node("a", -2, 0, 1),
      node("b", 3, 1, -1),
    ]);
    expect(bounds.minX).toBe(-2);
    expect(bounds.maxX).toBe(3);
    expect(bounds.minY).toBe(0);
    expect(bounds.maxY).toBe(1);
    expect(bounds.minZ).toBe(-1);
    expect(bounds.maxZ).toBe(1);
  });

  it("ignores invalid positions deterministically", () => {
    const invalid = node("bad", Number.NaN, 0, 0);
    const bounds = boundsFrom3DNodes([invalid, node("good", 1, 0, 1)]);
    expect(bounds.minX).toBe(1);
    expect(bounds.maxX).toBe(1);
  });
});

describe("centerFromBounds3D and radiusFromBounds3D", () => {
  it("computes stable center and radius", () => {
    const bounds = boundsFrom3DNodes([node("a", -2, 0, -2), node("b", 2, 2, 2)]);
    const center = centerFromBounds3D(bounds);
    expect(center).toEqual({ x: 0, y: 1, z: 0 });
    const radius = radiusFromBounds3D(bounds);
    expect(radius).toBeGreaterThanOrEqual(2);
    expect(radius).toBeCloseTo(Math.sqrt(4 * 4 + 2 * 2 + 4 * 4) / 2, 5);
  });

  it("enforces minimum radius of 2", () => {
    const bounds = boundsFrom3DNodes([node("a", 0, 0, 0)]);
    expect(radiusFromBounds3D(bounds)).toBe(2);
  });
});

describe("fitSceneToNodes", () => {
  it("returns deterministic fit pose", () => {
    const nodes = [node("a", -1, 0, -1), node("b", 1, 1, 1)];
    const first = fitSceneToNodes(nodes);
    const second = fitSceneToNodes(nodes);
    expect(first).toEqual(second);
    expect(first.cameraPose.target).toEqual([0, 0.5, 0]);
    expect(first.cameraPose.distance).toBe(first.radius * 2.2);
    expect(first.cameraPose.position.every(Number.isFinite)).toBe(true);
  });
});

describe("focusAssetPose3D", () => {
  const point = { x: 2, y: 1, z: -1 };

  it("returns valid pose for asset mode", () => {
    const pose = focusAssetPose3D(point, 2, "asset");
    expect(pose.position.every(Number.isFinite)).toBe(true);
    expect(pose.target).toEqual([2, 1, -1]);
    expect(pose.distance).toBeGreaterThan(0);
  });

  it("root mode is wider than asset mode", () => {
    const assetPose = focusAssetPose3D(point, 2, "asset");
    const rootPose = focusAssetPose3D(point, 2, "root");
    expect(rootPose.distance).toBeGreaterThan(assetPose.distance);
  });

  it("plant mode matches fit-style distance", () => {
    const plantPose = focusAssetPose3D(point, 2, "plant");
    expect(plantPose.distance).toBe(2 * 2.2);
  });
});

describe("getSceneScaleBand", () => {
  const fitDistance = 10;

  it("maps distance thresholds to zoom bands", () => {
    expect(getSceneScaleBand(9, fitDistance)).toBe("plant");
    expect(getSceneScaleBand(6, fitDistance)).toBe("area");
    expect(getSceneScaleBand(3, fitDistance)).toBe("asset");
    expect(getSceneScaleBand(1, fitDistance)).toBe("component");
  });

  it("returns plant for invalid distance", () => {
    expect(getSceneScaleBand(Number.NaN, fitDistance)).toBe("plant");
    expect(getSceneScaleBand(5, 0)).toBe("plant");
  });
});

describe("findNodePosition3D", () => {
  const nodes = [node("MTR-301", 1, 0, 2)];

  it("finds existing node position", () => {
    expect(findNodePosition3D(nodes, "MTR-301")).toEqual({ x: 1, y: 0, z: 2 });
  });

  it("returns null for missing node", () => {
    expect(findNodePosition3D(nodes, "missing")).toBeNull();
  });
});