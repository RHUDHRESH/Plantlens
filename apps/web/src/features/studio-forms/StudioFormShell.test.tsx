import { describe, expect, it } from "vitest";
import { validateBundleLocally } from "./validation";
import type { AuthoredBundle } from "../../app/store/studio";

const MIN_BUNDLE: AuthoredBundle = {
  plant: {
    plant_id: "p1",
    name: "Test",
    version: "1.0.0",
    assets: [{ id: "A1", type: "load.lamp", display_name: "Lamp" }],
    connections: [],
    roles: ["operator"],
  },
  tag_map: { version: "1", tags: [{ tag: "T1", asset_id: "MISSING", source_id: "s", signal_type: "x", unit: "V" }] },
  alarm_rules: { version: "1", rules: [{ id: "AL1", tag: "NOPE", severity: "warning", message: "m", condition: { op: ">" } }] },
  causal_graph: {
    version: "1",
    graph_id: "g1",
    nodes: [{ id: "A1", kind: "asset" }],
    edges: [{ id: "E1", from: "A1", to: "A1", edge_type: "signal", approved: false, lag_ms: [0, 1], provenance: "manual" }],
  },
  action_envelope: { actions: [] },
};

/** Legacy local validation used by old studio store — kept for regression coverage. */
describe("legacy studio validation", () => {
  it("rejects invalid tag reference with fix hint", () => {
    const issues = validateBundleLocally(MIN_BUNDLE);
    expect(issues.some((i) => i.code === "UNKNOWN_ASSET_REF")).toBe(true);
    expect(issues.some((i) => i.fix.includes("asset"))).toBe(true);
  });

  it("rejects self-loop edge", () => {
    const issues = validateBundleLocally(MIN_BUNDLE);
    expect(issues.some((i) => i.code === "SELF_LOOP")).toBe(true);
  });
});