import { describe, expect, it } from "vitest";
import type { CausalGraphView } from "../../api/v2";
import { GRAPH_FIXTURE } from "./graphFixture";
import {
  NODE_H,
  NODE_W,
  edgeLabel,
  fitScale,
  formatLag,
  fromElkResult,
  labelAnchor,
  layoutCausalGraph,
  loopBounds,
  loopGroups,
  toElkGraph,
  visibleEdges,
} from "./graphModel";

describe("graph → elk input", () => {
  it("uses layered + orthogonal routing and hides drafts unless asked", () => {
    const g = toElkGraph(GRAPH_FIXTURE, false);
    expect(g.layoutOptions?.["elk.algorithm"]).toBe("layered");
    expect(g.layoutOptions?.["elk.edgeRouting"]).toBe("ORTHOGONAL");
    expect(g.children).toHaveLength(5);
    expect(g.children?.[0]).toMatchObject({ width: NODE_W, height: NODE_H });
    expect(g.edges?.map((e) => e.id)).not.toContain("E_UNAPPROVED");
    expect(toElkGraph(GRAPH_FIXTURE, true).edges?.map((e) => e.id)).toContain("E_UNAPPROVED");
    expect(toElkGraph(GRAPH_FIXTURE, true, "DOWN").layoutOptions?.["elk.direction"]).toBe("DOWN");
  });

  it("drops edges that point at unknown nodes", () => {
    const view: CausalGraphView = { ...GRAPH_FIXTURE, edges: [...GRAPH_FIXTURE.edges, { ...GRAPH_FIXTURE.edges[0]!, id: "BAD", to: "NOPE" }] };
    expect(visibleEdges(view, true).map((e) => e.id)).not.toContain("BAD");
  });

  it("labels edges with polarity and lag window", () => {
    expect(edgeLabel(GRAPH_FIXTURE.edges[2]!)).toBe("−  ≤ 4 s");
    expect(edgeLabel(GRAPH_FIXTURE.edges[0]!)).toBe("≤ 0.8 s");
    expect(formatLag([100, 900])).toBe("0.1 s–0.9 s");
    expect(formatLag([0, 120_000])).toBe("≤ 2 min");
  });
});

describe("elk result → positions", () => {
  it("reads node boxes and flattens edge sections into polylines", () => {
    const layout = fromElkResult({
      id: "root",
      width: 500,
      height: 200,
      children: [
        { id: "A", x: 10, y: 20, width: 100, height: 40 },
        { id: "B", x: 300, y: 20, width: 100, height: 40 },
      ],
      edges: [
        {
          id: "E",
          sources: ["A"],
          targets: ["B"],
          sections: [{ id: "s", startPoint: { x: 110, y: 40 }, bendPoints: [{ x: 200, y: 40 }, { x: 200, y: 60 }], endPoint: { x: 300, y: 60 } }],
        },
      ],
    });
    expect(layout.nodes.A).toEqual({ id: "A", x: 10, y: 20, width: 100, height: 40 });
    expect(layout.edges[0]!.points).toEqual([
      { x: 110, y: 40 },
      { x: 200, y: 40 },
      { x: 200, y: 60 },
      { x: 300, y: 60 },
    ]);
    expect(layout.width).toBe(500);
    expect(fitScale(layout, { width: 1000, height: 100 })).toBe(0.5);
  });

  it("anchors labels on the longest segment", () => {
    expect(labelAnchor([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 100 }])).toEqual({ x: 10, y: 50, horizontal: false });
    expect(labelAnchor([{ x: 0, y: 0 }, { x: 80, y: 0 }])).toEqual({ x: 40, y: 0, horizontal: true });
    expect(labelAnchor([{ x: 0, y: 0 }])).toBeNull();
  });

  it("lays out the real graph with elk: every node placed, edges routed orthogonally", async () => {
    const layout = await layoutCausalGraph(GRAPH_FIXTURE, true, { width: 1200, height: 600 });
    expect(Object.keys(layout.nodes).sort()).toEqual(GRAPH_FIXTURE.nodes.map((n) => n.id).sort());
    for (const e of layout.edges) {
      expect(e.points.length).toBeGreaterThanOrEqual(2);
      for (let i = 0; i < e.points.length - 1; i++) {
        const a = e.points[i]!;
        const b = e.points[i + 1]!;
        expect(Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5).toBe(true);
      }
    }
  }, 20_000);

  it("handles ~100 nodes", async () => {
    const nodes = Array.from({ length: 100 }, (_, i) => ({ id: `N${i}`, label: `Node ${i}`, asset_type: null, evidence_tags: [], status: "normal" }));
    const edges = nodes.slice(1).map((n, i) => ({
      id: `E${i}`,
      from: `N${Math.floor(i / 3)}`,
      to: n.id,
      approved: true,
      edge_type: null,
      lag_ms: [0, 1000] as [number, number],
      polarity: "any" as const,
      loop_ok: false,
      loop_id: null,
      provenance: null,
    }));
    const t0 = performance.now();
    const layout = await layoutCausalGraph({ ...GRAPH_FIXTURE, nodes, edges, feedback_loops: [] }, true);
    expect(Object.keys(layout.nodes)).toHaveLength(100);
    expect(performance.now() - t0).toBeLessThan(10_000);
  }, 20_000);
});

describe("feedback loops", () => {
  it("groups loop members with id, polarity and lag per turn", () => {
    const [loop] = loopGroups(GRAPH_FIXTURE);
    expect(loop).toMatchObject({ id: "L_DRIVE", polarity: "balancing", lag: [100, 5400] });
    expect(loop!.edgeIds.sort()).toEqual(["E4", "E5", "E7"]);
  });

  it("reports unknown polarity when an edge has none", () => {
    const view: CausalGraphView = {
      ...GRAPH_FIXTURE,
      edges: GRAPH_FIXTURE.edges.map((e) => (e.id === "E4" ? { ...e, polarity: "any" } : e)),
    };
    expect(loopGroups(view)[0]!.polarity).toBe("unknown");
  });

  it("computes a padded hull around member nodes", () => {
    const b = loopBounds(
      { nodes: { A: { id: "A", x: 0, y: 0, width: 10, height: 10 }, B: { id: "B", x: 50, y: 20, width: 10, height: 10 } }, edges: [], width: 0, height: 0 },
      ["A", "B"],
      5,
    );
    expect(b).toEqual({ x: -5, y: -21, w: 70, h: 56 });
  });
});
