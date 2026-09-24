import { describe, expect, it } from "vitest";
import { buildPlantModel } from "../operational-map/plantModel";
import { COMPILED_FIXTURE } from "../operational-map/testUtils";
import {
  COMPACT_BELOW,
  LABEL_MIN_PX,
  MAP_SCALE_X,
  MAP_SCALE_Y,
  NODE_W,
  SECONDARY_MIN_PX,
  causalEdgeIds,
  contentBounds,
  keyTagFor,
  mapTextBand,
  placeNodes,
  routeConnection,
  truncateLabel,
} from "./mapLayout";

const model = buildPlantModel(COMPILED_FIXTURE as never);

describe("overview map layout", () => {
  it("places nodes from plant.json coordinates (scaled, never hand-placed)", () => {
    const nodes = placeNodes(model.assets);
    const bus = nodes.find((n) => n.asset.id === "BUS-101")!;
    expect(bus.x).toBeCloseTo(660 * MAP_SCALE_X);
    expect(bus.y).toBeCloseTo(160 * MAP_SCALE_Y);
    const b = contentBounds(nodes);
    for (const n of nodes) {
      expect(n.x - NODE_W / 2).toBeGreaterThanOrEqual(b.x);
      expect(n.x + NODE_W / 2).toBeLessThanOrEqual(b.x + b.w);
    }
  });

  it("routes single-line connections orthogonally", () => {
    const a = { asset: model.assets[0]!, x: 0, y: 0 };
    const b = { asset: model.assets[1]!, x: 200, y: 50 };
    expect(routeConnection(a, b)).toBe(`M${NODE_W / 2},0H100V50H${200 - NODE_W / 2}`);
    expect(routeConnection(a, { ...b, y: 0 })).toBe(`M${NODE_W / 2},0H${200 - NODE_W / 2}`);
  });

  it("highlights the map edges along the causal path, bridging non-adjacent steps", () => {
    // MTR-301 → BUS-101 is not a direct connection: it runs through INV-102.
    expect([...causalEdgeIds(["MTR-301", "BUS-101", "INV-102"], model.connections)].sort()).toEqual([
      "BUS-101->INV-102",
      "INV-102->MTR-301",
    ]);
    expect(causalEdgeIds(["MTR-301"], model.connections).size).toBe(0);
    expect(causalEdgeIds(null, model.connections).size).toBe(0);
  });

  it("shows an alarmed tag's value before other tags", () => {
    const motor = model.assetById["MTR-301"]!;
    const tags = {
      MOTOR_301_CURRENT: { tag_id: "MOTOR_301_CURRENT", asset_id: "MTR-301", value: 3.4, unit: "A", quality: "GOOD", timestamp: "", source: "simulator" },
      MOTOR_301_TEMP: { tag_id: "MOTOR_301_TEMP", asset_id: "MTR-301", value: 78, unit: "C", quality: "GOOD", timestamp: "", source: "simulator" },
    } as const;
    expect(keyTagFor(motor, tags as never, new Set())?.tag_id).toBe("MOTOR_301_CURRENT");
    expect(keyTagFor(motor, tags as never, new Set(["MOTOR_301_TEMP"]))?.tag_id).toBe("MOTOR_301_TEMP");
    expect(keyTagFor(model.assetById["PV-101"]!, tags as never, new Set())).toBeNull();
  });

  it("keeps on-screen text at or above the minimum at any zoom and drops secondary text when cramped", () => {
    for (const s of [0.5, 0.7, 0.85, 1, 1.6]) {
      const band = mapTextBand(s);
      expect(band.label * s).toBeGreaterThanOrEqual(LABEL_MIN_PX - 1e-9);
      expect(band.secondary * s).toBeGreaterThanOrEqual(SECONDARY_MIN_PX - 1e-9);
      expect(band.compact).toBe(s < COMPACT_BELOW);
    }
    // Zoomed in: base sizes, no counter-scaling.
    expect(mapTextBand(1.6)).toMatchObject({ label: 13.5, secondary: 12.5, tagK: 1, badgeK: 1 });
    // Status tag text (9.5 units) reaches 11 px at 1280-class scales.
    expect(9.5 * mapTextBand(0.75).tagK * 0.75).toBeGreaterThanOrEqual(SECONDARY_MIN_PX - 1e-9);
    expect(truncateLabel("MPPT Controller", 20)).toBe("MPPT Controller");
    expect(truncateLabel("MPPT Controller", 8)).toBe("MPPT Co…");
  });
});
