/**
 * Auto-arrange adapter: assembly → ELK layered graph (left→right along the energy flow, output →
 * input) and ELK result → grid-snapped positions + orthogonal wire routes. elkjs is loaded lazily
 * so it never lands in the Studio chunk.
 *
 * Routes are a pure projection (never part of the assembly document). Each route remembers the
 * positions of its two endpoint nodes at layout time; it is only drawn while both nodes still sit
 * exactly there, so moving either endpoint (drag, nudge, undo…) drops it back to smoothstep.
 */
import type { ElkExtendedEdge, ElkNode, ElkPort } from "elkjs/lib/elk-api";
import type { PlantAssembly } from "../../../app/schemas/plantAssembly";
import type { ComponentTemplate } from "../componentLibraryTypes";
import type { XY } from "./assemblyOps";
import { boundsOf, GRID, snap } from "./geometry";
import { cachedLayout } from "./portLayout";

export interface EdgeRoute {
  /** Interior bend points (flow coordinates), excluding the port endpoints. */
  points: XY[];
  /** Endpoint node positions the route was computed for. */
  source: XY;
  target: XY;
}

export type EdgeRoutes = Record<string, EdgeRoute>;

export interface AutoLayoutResult {
  positions: Record<string, XY>;
  routes: EdgeRoutes;
}

export const LAYOUT_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.spacing.nodeNode": "48",
  "elk.layered.spacing.nodeNodeBetweenLayers": "80",
  "elk.spacing.edgeNode": "24",
  "elk.spacing.edgeEdge": "16",
  "elk.layered.spacing.edgeNodeBetweenLayers": "32",
  "elk.layered.spacing.edgeEdgeBetweenLayers": "16",
  "elk.spacing.componentComponent": "96",
  "elk.separateConnectedComponents": "true",
  "elk.padding": "[top=0,left=0,bottom=0,right=0]",
};

const portKey = (assetId: string, portId: string) => `${assetId}::${portId}`;

/** Build the ELK graph for `ids` (all assets when omitted); only edges inside the set are laid out. */
export function assemblyToElk(assembly: PlantAssembly, templates: ReadonlyMap<string, ComponentTemplate>, ids?: readonly string[]): ElkNode {
  const want = ids ? new Set(ids) : null;
  const assets = assembly.assets.filter((a) => !want || want.has(a.asset_id));
  const inSet = new Set(assets.map((a) => a.asset_id));
  const portsByAsset = new Map<string, Set<string>>();
  const children: ElkNode[] = assets.map((a) => {
    const layout = cachedLayout(templates.get(a.component_type_id)?.ports ?? []);
    const ports: ElkPort[] = Object.values(layout.byId).map((p) => ({
      id: portKey(a.asset_id, p.port.port_id),
      x: p.side === "left" ? 0 : layout.width,
      y: p.offsetY,
      width: 0,
      height: 0,
      layoutOptions: { "elk.port.side": p.side === "left" ? "WEST" : "EAST" },
    }));
    portsByAsset.set(a.asset_id, new Set(Object.keys(layout.byId)));
    return {
      id: a.asset_id,
      width: layout.width,
      height: layout.height,
      ports,
      layoutOptions: { "elk.portConstraints": "FIXED_POS" },
    };
  });
  const edges: ElkExtendedEdge[] = assembly.connections
    .filter((c) => inSet.has(c.from_asset_id) && inSet.has(c.to_asset_id) && c.from_asset_id !== c.to_asset_id)
    .map((c) => {
      const fromOk = portsByAsset.get(c.from_asset_id)?.has(c.from_port_id);
      const toOk = portsByAsset.get(c.to_asset_id)?.has(c.to_port_id);
      return {
        id: c.connection_id,
        sources: [fromOk ? portKey(c.from_asset_id, c.from_port_id) : c.from_asset_id],
        targets: [toOk ? portKey(c.to_asset_id, c.to_port_id) : c.to_asset_id],
      };
    });
  return { id: "root", layoutOptions: LAYOUT_OPTIONS, children, edges };
}

/**
 * ELK result → snapped absolute positions, anchored so the laid-out block keeps the top-left of the
 * original set (the viewport does not jump), plus bend points translated the same way.
 */
export function elkToLayout(result: ElkNode, anchor: XY): AutoLayoutResult {
  const children = result.children ?? [];
  const minX = Math.min(...children.map((c) => c.x ?? 0));
  const minY = Math.min(...children.map((c) => c.y ?? 0));
  const ox = snap(anchor.x) - minX;
  const oy = snap(anchor.y) - minY;
  const positions: Record<string, XY> = {};
  for (const c of children) positions[c.id] = { x: snap((c.x ?? 0) + ox, GRID), y: snap((c.y ?? 0) + oy, GRID) };
  const routes: EdgeRoutes = {};
  for (const e of result.edges ?? []) {
    const section = e.sections?.[0];
    const src = e.sources[0]?.split("::")[0];
    const tgt = e.targets[0]?.split("::")[0];
    if (!section || !src || !tgt || !positions[src] || !positions[tgt]) continue;
    routes[e.id] = {
      points: (section.bendPoints ?? []).map((p) => ({ x: Math.round(p.x + ox), y: Math.round(p.y + oy) })),
      source: positions[src]!,
      target: positions[tgt]!,
    };
  }
  return { positions, routes };
}

type ElkInstance = { layout: (graph: ElkNode) => Promise<ElkNode> };
let elkPromise: Promise<ElkInstance> | null = null;

function getElk(): Promise<ElkInstance> {
  elkPromise ??= import("elkjs/lib/elk.bundled.js").then((m) => new (m as unknown as { default: new () => ElkInstance }).default());
  return elkPromise;
}

/** Lay out `ids` (≥2) or the whole assembly. Resolves null when there is nothing to arrange. */
export async function computeAutoLayout(
  assembly: PlantAssembly,
  templates: ReadonlyMap<string, ComponentTemplate>,
  ids?: readonly string[],
): Promise<AutoLayoutResult | null> {
  const graph = assemblyToElk(assembly, templates, ids);
  const kids = graph.children ?? [];
  if (kids.length < 2) return null;
  const bounds = boundsOf(
    assembly.assets
      .filter((a) => kids.some((k) => k.id === a.asset_id))
      .map((a) => ({ id: a.asset_id, x: a.position_2d.x, y: a.position_2d.y, width: 0, height: 0 })),
  );
  const elk = await getElk();
  const result = await elk.layout(graph);
  return elkToLayout(result, bounds ? { x: bounds.x, y: bounds.y } : { x: 0, y: 0 });
}

/** The route to draw for an edge, or null when an endpoint has moved since it was computed. */
export function validRoute(route: EdgeRoute | undefined, source: XY | undefined, target: XY | undefined): EdgeRoute | null {
  if (!route || !source || !target) return null;
  if (route.source.x !== source.x || route.source.y !== source.y) return null;
  if (route.target.x !== target.x || route.target.y !== target.y) return null;
  return route;
}

/**
 * Orthogonal polyline from the live handle positions through the stored bends. Snapping shifts
 * nodes by < half a grid step from where ELK put them, so the first/last bends are re-aligned to
 * the actual port y (the leaving/entering segments stay horizontal).
 */
export function orthogonalPoints(source: XY, bends: readonly XY[], target: XY): XY[] {
  if (!bends.length) {
    if (source.y === target.y) return [source, target];
    const mx = Math.round((source.x + target.x) / 2);
    return [source, { x: mx, y: source.y }, { x: mx, y: target.y }, target];
  }
  const pts = bends.map((p) => ({ ...p }));
  pts[0]!.y = source.y;
  pts[pts.length - 1]!.y = target.y;
  if (pts.length === 1) {
    // A single bend cannot be orthogonal on both sides: split it into a vertical step.
    const b = pts[0]!;
    return [source, { x: b.x, y: source.y }, { x: b.x, y: target.y }, target];
  }
  return [source, ...pts, target];
}

/** Rounded-corner SVG path through orthogonal points; returns [d, labelX, labelY]. */
export function roundedPath(points: readonly XY[], radius = 10): [string, number, number] {
  const pts = points.filter((p, i) => i === 0 || p.x !== points[i - 1]!.x || p.y !== points[i - 1]!.y);
  let d = `M ${pts[0]!.x},${pts[0]!.y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const c = pts[i + 1]!;
    const r = Math.min(radius, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2);
    const inX = b.x - Math.sign(b.x - a.x) * r;
    const inY = b.y - Math.sign(b.y - a.y) * r;
    const outX = b.x + Math.sign(c.x - b.x) * r;
    const outY = b.y + Math.sign(c.y - b.y) * r;
    d += ` L ${inX},${inY} Q ${b.x},${b.y} ${outX},${outY}`;
  }
  const last = pts[pts.length - 1]!;
  d += ` L ${last.x},${last.y}`;
  // Label at the midpoint of the longest segment.
  let best = 0;
  let lx = (pts[0]!.x + last.x) / 2;
  let ly = (pts[0]!.y + last.y) / 2;
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
    if (len > best) {
      best = len;
      lx = (pts[i]!.x + pts[i - 1]!.x) / 2;
      ly = (pts[i]!.y + pts[i - 1]!.y) / 2;
    }
  }
  return [d, lx, ly];
}
