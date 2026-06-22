import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function readSource(filename: string): string {
  return readFileSync(join(here, filename), "utf8");
}

describe("PlantMap3D data path", () => {
  it("uses Map3DNode types and does not import 2D MapNode", () => {
    const source = readSource("PlantMap3D.tsx");
    expect(source).toContain("Map3DNode");
    expect(source).toContain("Map3DEdge");
    expect(source).not.toMatch(/import type \{[^}]*MapNode/);
    expect(source).not.toContain("map_2d");
  });

  it("does not scale coordinates by 0.02", () => {
    const source = readSource("PlantMap3D.tsx");
    expect(source).not.toContain("0.02");
    expect(source).toContain("n.position.x");
    expect(source).toContain("n.position.y");
    expect(source).toContain("n.position.z");
  });

  it("uses operational camera hook and exposes viewport controls", () => {
    const source = readSource("PlantMap3D.tsx");
    expect(source).toContain("useOperationalCamera3D");
    expect(source).toContain("onViewportReady");
    expect(source).not.toContain("CameraFocus");
    expect(source).toContain("visibleLayers?.causal_path");
  });

  it("keeps Canvas wrapper and WebGL fallback export", () => {
    const source = readSource("PlantMap3D.tsx");
    expect(source).toContain("<Canvas");
    expect(source).toContain("PlantMap3DFallback");
  });
});

describe("AssetMeshes coordinate path", () => {
  it("positions meshes from Map3D x/y/z without 2D scaling", () => {
    const source = readSource("AssetMeshes.tsx");
    expect(source).toContain("Map3DNode");
    expect(source).not.toMatch(/position\?\.x[^;]*\* 0\.02/);
    expect(source).not.toMatch(/position\?\.y[^;]*\* 0\.02/);
    expect(source).toContain("node.position.x");
    expect(source).toContain("node.position.y");
    expect(source).toContain("node.position.z");
  });
});