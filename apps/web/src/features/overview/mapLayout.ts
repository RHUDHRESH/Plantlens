/**
 * Pure geometry for the Overview single-line map. Positions come from plant.json (via the
 * compiled bundle) and are only scaled uniformly; nothing is hand-placed here.
 */
import type { TagFrame } from "../../app/schemas/tagFrame";
import type { Box } from "../operational-map/usePanZoom";
import type { PlantAsset, PlantConnection } from "../operational-map/plantModel";

/**
 * plant.json coordinates are authored for a wide single-line layout; a mild anisotropic scale
 * keeps topology and ordering intact while letting labels stay legible in a typical viewport.
 */
export const MAP_SCALE_X = 0.75;
export const MAP_SCALE_Y = 1.1;
export const NODE_W = 116;
export const NODE_H = 84;

export interface PlacedNode {
  asset: PlantAsset;
  x: number;
  y: number;
}

export function placeNodes(assets: PlantAsset[]): PlacedNode[] {
  return assets
    .filter((a) => a.position)
    .map((a) => ({ asset: a, x: a.position!.x * MAP_SCALE_X, y: a.position!.y * MAP_SCALE_Y }));
}

export function contentBounds(nodes: PlacedNode[], pad = 28): Box {
  if (!nodes.length) return { x: 0, y: 0, w: 800, h: 400 };
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const minX = Math.min(...xs) - NODE_W / 2;
  const maxX = Math.max(...xs) + NODE_W / 2;
  const minY = Math.min(...ys) - NODE_H / 2 - 14;
  const maxY = Math.max(...ys) + NODE_H / 2 + 24;
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

/** Orthogonal single-line route: right port of `from` → left port of `to`, elbow at mid-x. */
export function routeConnection(a: PlacedNode, b: PlacedNode): string {
  const forward = b.x >= a.x;
  const x1 = a.x + (forward ? NODE_W / 2 : -NODE_W / 2);
  const x2 = b.x + (forward ? -NODE_W / 2 : NODE_W / 2);
  const y1 = a.y;
  const y2 = b.y;
  if (Math.abs(y1 - y2) < 0.5) return `M${x1},${y1}H${x2}`;
  const mx = (x1 + x2) / 2;
  return `M${x1},${y1}H${mx}V${y2}H${x2}`;
}

/**
 * Map edges on the causal path. Consecutive path members that are not directly connected are
 * joined through the shortest route in the (undirected) plant topology.
 */
export function causalEdgeIds(path: string[] | null | undefined, connections: PlantConnection[]): Set<string> {
  const out = new Set<string>();
  if (!path || path.length < 2) return out;
  const adj = new Map<string, { to: string; id: string }[]>();
  for (const c of connections) {
    adj.set(c.from, [...(adj.get(c.from) ?? []), { to: c.to, id: c.id }]);
    adj.set(c.to, [...(adj.get(c.to) ?? []), { to: c.from, id: c.id }]);
  }
  for (let i = 0; i < path.length - 1; i++) {
    const start = path[i]!;
    const goal = path[i + 1]!;
    const prev = new Map<string, { node: string; edge: string }>();
    const queue = [start];
    const seen = new Set([start]);
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur === goal) break;
      for (const n of adj.get(cur) ?? []) {
        if (seen.has(n.to)) continue;
        seen.add(n.to);
        prev.set(n.to, { node: cur, edge: n.id });
        queue.push(n.to);
      }
    }
    let cur = goal;
    while (prev.has(cur)) {
      const p = prev.get(cur)!;
      out.add(p.edge);
      cur = p.node;
    }
  }
  return out;
}

/** The value worth showing on the node: an alarmed tag first, then the first live tag. */
export function keyTagFor(asset: PlantAsset, tags: Record<string, TagFrame>, alarmedTagIds: Set<string>): TagFrame | null {
  const live = asset.tags.map((t) => tags[t]).filter((t): t is TagFrame => !!t);
  return live.find((t) => alarmedTagIds.has(t.tag_id)) ?? live[0] ?? null;
}
