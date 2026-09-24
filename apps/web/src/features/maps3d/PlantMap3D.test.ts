import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Map3DNode } from "../ops3d/map3dTypes";
import { buildPlantLayout } from "../plant3d/lib/layout";

const here = dirname(fileURLToPath(import.meta.url));

function readSource(filename: string): string {
  return readFileSync(join(here, filename), "utf8");
}

describe("PlantMap3D (legacy API on the plant3d engine)", () => {
  it("keeps the Map3D view-model contract and does not use 2D map nodes", () => {
    const source = readSource("PlantMap3D.tsx");
    expect(source).toContain("Map3DNode");
    expect(source).toContain("Map3DEdge");
    expect(source).not.toMatch(/import type \{[^}]*MapNode/);
    expect(source).not.toContain("map_2d");
  });

  it("renders through the shared plant3d scene and exposes viewport controls", () => {
    const source = readSource("PlantMap3D.tsx");
    expect(source).toContain("PlantScene");
    expect(source).toContain("buildPlantLayout");
    expect(source).toContain("onViewportReady");
    expect(source).toContain("visibleLayers?.causal_path");
    expect(source).toContain("PlantMap3DFallback");
  });

  it("LazyPlantMap3D keeps the lazy import + WebGL fallback", () => {
    const source = readSource("LazyPlantMap3D.tsx");
    expect(source).toContain('import("./PlantMap3D")');
    expect(source).toContain("webglAvailable");
  });
});

describe("3D coordinates are not 2D pixel coordinates", () => {
  it("places compiled map_3d plan coordinates in metres without the old 0.02 pixel scaling", () => {
    const nodes: Map3DNode[] = [
      { id: "A", label: "A", asset_type: "load.motor_3phase", position: { x: 0, y: 0, z: 0 }, status_binding: "asset_status.A" },
      { id: "B", label: "B", asset_type: "load.motor_3phase", position: { x: 4, y: 0, z: 0 }, status_binding: "asset_status.B" },
    ];
    const layout = buildPlantLayout(nodes);
    const [a, b] = layout.assets;
    expect(b!.position[0] - a!.position[0]).toBeCloseTo(4 * layout.scale, 5);
    expect(layout.scale).toBeGreaterThanOrEqual(1);
  });
});
