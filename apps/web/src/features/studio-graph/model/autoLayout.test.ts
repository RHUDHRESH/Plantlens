import { beforeEach, describe, expect, it } from "vitest";
import { demoAssembly } from "../demoAssembly";
import { resetStudioStore, useStudioStore } from "../studioStore";
import { LIBRARY } from "../testUtils";
import { assemblyToElk, computeAutoLayout, elkToLayout, orthogonalPoints, validRoute } from "./autoLayout";
import { GRID } from "./geometry";
import { cachedLayout } from "./portLayout";

const templates = new Map(LIBRARY.map((c) => [c.component_type_id, c]));

describe("assemblyToElk", () => {
  const a = demoAssembly("demo_microgrid_001");

  it("maps assets to fixed-port nodes and connections output→input, flowing RIGHT", () => {
    const g = assemblyToElk(a, templates);
    expect(g.layoutOptions?.["elk.direction"]).toBe("RIGHT");
    expect(g.layoutOptions?.["elk.edgeRouting"]).toBe("ORTHOGONAL");
    expect(g.children).toHaveLength(a.assets.length);
    const first = a.assets[0]!;
    const node = g.children!.find((n) => n.id === first.asset_id)!;
    const layout = cachedLayout(templates.get(first.component_type_id)!.ports);
    expect(node.width).toBe(layout.width);
    expect(node.height).toBe(layout.height);
    for (const p of node.ports ?? []) {
      const placed = layout.byId[p.id!.split("::")[1]!]!;
      expect(p.x).toBe(placed.side === "left" ? 0 : layout.width);
      expect(p.y).toBe(placed.offsetY);
    }
    expect(g.edges).toHaveLength(a.connections.length);
    const c = a.connections[0]!;
    const e = g.edges!.find((x) => x.id === c.connection_id)!;
    expect(e.sources[0]).toBe(`${c.from_asset_id}::${c.from_port_id}`);
    expect(e.targets[0]).toBe(`${c.to_asset_id}::${c.to_port_id}`);
  });

  it("restricts nodes and edges to a subset", () => {
    const ids = [a.connections[0]!.from_asset_id, a.connections[0]!.to_asset_id];
    const g = assemblyToElk(a, templates, ids);
    expect(g.children!.map((n) => n.id).sort()).toEqual([...new Set(ids)].sort());
    for (const e of g.edges!) {
      expect(ids).toContain(e.sources[0]!.split("::")[0]);
      expect(ids).toContain(e.targets[0]!.split("::")[0]);
    }
  });
});

describe("elkToLayout", () => {
  it("snaps positions to the grid and anchors the block at the original top-left", () => {
    const out = elkToLayout(
      {
        id: "root",
        children: [
          { id: "a", x: 12, y: 5, width: 256, height: 100 },
          { id: "b", x: 381, y: 47, width: 256, height: 100 },
        ],
        edges: [{ id: "e", sources: ["a::out"], targets: ["b::in"], sections: [{ id: "s", startPoint: { x: 268, y: 70 }, endPoint: { x: 381, y: 110 }, bendPoints: [{ x: 320, y: 70 }, { x: 320, y: 110 }] }] }],
      },
      { x: 100, y: 200 },
    );
    for (const p of Object.values(out.positions)) {
      expect(p.x % GRID).toBe(0);
      expect(p.y % GRID).toBe(0);
    }
    expect(out.positions.a).toEqual({ x: 96, y: 208 });
    expect(out.routes.e!.source).toEqual(out.positions.a);
    expect(out.routes.e!.target).toEqual(out.positions.b);
    expect(out.routes.e!.points).toHaveLength(2);
  });

  it("lays out the demo left→right with snapped, non-overlapping nodes and routes", async () => {
    const a = demoAssembly("demo_microgrid_001");
    const out = (await computeAutoLayout(a, templates))!;
    expect(Object.keys(out.positions)).toHaveLength(a.assets.length);
    const rects = a.assets.map((x) => ({ ...out.positions[x.asset_id]!, ...cachedLayout(templates.get(x.component_type_id)!.ports) }));
    for (const r of rects) expect([r.x % GRID, r.y % GRID]).toEqual([0, 0]);
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const p = rects[i]!;
        const q = rects[j]!;
        const overlap = p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;
        expect(overlap).toBe(false);
      }
    // Energy flows right: most sources sit left of their targets.
    const forward = a.connections.filter((c) => out.positions[c.from_asset_id]!.x < out.positions[c.to_asset_id]!.x).length;
    expect(forward / a.connections.length).toBeGreaterThan(0.8);
    expect(Object.keys(out.routes).length).toBe(a.connections.length);
  });
});

describe("routes", () => {
  const route = { points: [{ x: 300, y: 70 }, { x: 300, y: 120 }], source: { x: 0, y: 0 }, target: { x: 400, y: 32 } };

  it("drops waypoints once an endpoint moves", () => {
    expect(validRoute(route, { x: 0, y: 0 }, { x: 400, y: 32 })).toBe(route);
    expect(validRoute(route, { x: 16, y: 0 }, { x: 400, y: 32 })).toBeNull();
    expect(validRoute(route, { x: 0, y: 0 }, { x: 400, y: 48 })).toBeNull();
    expect(validRoute(undefined, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeNull();
  });

  it("keeps the port segments horizontal", () => {
    const pts = orthogonalPoints({ x: 256, y: 68 }, route.points, { x: 400, y: 116 });
    expect(pts[1]!.y).toBe(68);
    expect(pts[pts.length - 2]!.y).toBe(116);
    for (let i = 1; i < pts.length; i++) expect(pts[i]!.x === pts[i - 1]!.x || pts[i]!.y === pts[i - 1]!.y).toBe(true);
  });
});

describe("store: auto-arrange command", () => {
  beforeEach(() => {
    resetStudioStore();
    useStudioStore.getState().setLibrary(LIBRARY);
    useStudioStore.getState().loadAssembly(demoAssembly("demo_microgrid_001"));
  });

  it("is one undoable command; undo restores positions and invalidates waypoints", async () => {
    const s = useStudioStore.getState();
    const before = s.history.present;
    const out = (await computeAutoLayout(before, s.templates))!;
    expect(s.applyAutoLayout(out.positions, out.routes)).toBe(true);
    const after = useStudioStore.getState();
    expect(after.history.past).toHaveLength(1);
    expect(after.history.presentLabel).toBe("Auto-arrange");
    expect(after.layoutTween?.from).toBeTruthy();
    const pos = (id: string) => useStudioStore.getState().history.present.assets.find((x) => x.asset_id === id)!.position_2d;
    const c = before.connections[0]!;
    expect(validRoute(after.edgeRoutes[c.connection_id], pos(c.from_asset_id), pos(c.to_asset_id))).not.toBeNull();

    useStudioStore.getState().moveNodes({ [c.from_asset_id]: { x: pos(c.from_asset_id).x + 32, y: pos(c.from_asset_id).y } });
    expect(validRoute(useStudioStore.getState().edgeRoutes[c.connection_id], pos(c.from_asset_id), pos(c.to_asset_id))).toBeNull();

    useStudioStore.getState().undo();
    useStudioStore.getState().undo();
    expect(useStudioStore.getState().history.present.assets.map((x) => x.position_2d)).toEqual(before.assets.map((x) => x.position_2d));
    expect(validRoute(useStudioStore.getState().edgeRoutes[c.connection_id], pos(c.from_asset_id), pos(c.to_asset_id))).toBeNull();
  });
});
