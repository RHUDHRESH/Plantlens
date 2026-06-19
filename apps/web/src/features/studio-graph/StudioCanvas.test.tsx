import { describe, expect, it } from "vitest";
import { useStudioStore, type AuthoredBundle } from "../../app/store/studio";

const BUNDLE: AuthoredBundle = {
  plant: {
    plant_id: "p1",
    name: "Demo",
    version: "1",
    assets: [
      { id: "A1", type: "load.lamp", display_name: "A1", coords_2d: { x: 10, y: 20 } },
      { id: "A2", type: "load.lamp", display_name: "A2", coords_2d: { x: 100, y: 20 } },
    ],
    connections: [],
  },
  tag_map: { version: "1", tags: [] },
  alarm_rules: { version: "1", rules: [] },
  causal_graph: {
    version: "1",
    graph_id: "g1",
    nodes: [
      { id: "A1", kind: "asset" },
      { id: "A2", kind: "asset" },
    ],
    edges: [
      {
        id: "E1",
        from: "A1",
        to: "A2",
        edge_type: "structural_power",
        approved: true,
        lag_ms: [0, 1000],
        provenance: "manual",
      },
    ],
  },
  action_envelope: { actions: [] },
};

describe("Studio graph store integration", () => {
  it("toggle approved updates canonical edge", () => {
    useStudioStore.getState().setBundle(structuredClone(BUNDLE));
    useStudioStore.getState().toggleEdgeApproved("E1", false);
    const edge = useStudioStore.getState().bundle?.causal_graph.edges[0];
    expect(edge?.approved).toBe(false);
  });

  it("setNodePosition updates coords only", () => {
    useStudioStore.getState().setBundle(structuredClone(BUNDLE));
    useStudioStore.getState().setNodePosition("A1", { x: 50, y: 60 });
    const asset = useStudioStore.getState().bundle?.plant.assets.find((a) => a.id === "A1");
    expect(asset?.coords_2d).toEqual({ x: 50, y: 60 });
    expect(asset?.display_name).toBe("A1");
  });
});