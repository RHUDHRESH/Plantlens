/**
 * Causal graph view model: /api/runtime/causal-graph → elk input, elk result → positions and
 * routed edges, plus feedback-loop groups. Read-only projection; the runtime uses approved
 * edges only, drafts are drawn for context.
 */
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";
import type { CausalGraphView } from "../../api/v2";

export type GraphNode = CausalGraphView["nodes"][number];
export type GraphEdge = CausalGraphView["edges"][number];

export const NODE_W = 172;
export const NODE_H = 64;

export const ELK_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.spacing.nodeNodeBetweenLayers": "84",
  "elk.spacing.nodeNode": "36",
  "elk.spacing.edgeNode": "20",
  "elk.spacing.edgeEdge": "18",
  "elk.layered.spacing.edgeNodeBetweenLayers": "24",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.edgeLabels.inline": "false",
  "elk.layered.edgeLabels.sideSelection": "SMART_UP",
  "elk.padding": "[top=32,left=24,bottom=24,right=24]",
};

export function formatLag(lag: [number, number] | null | undefined): string {
  if (!lag) return "";
  const f = (ms: number) => (ms >= 60_000 ? `${+(ms / 60_000).toFixed(1)} min` : `${+(ms / 1000).toFixed(1)} s`);
  if (lag[0] === 0) return `≤ ${f(lag[1])}`;
  return `${f(lag[0])}–${f(lag[1])}`;
}

export function polarityText(p: GraphEdge["polarity"]): string {
  return p === "+" ? "+" : p === "-" ? "−" : "±";
}

export function edgeLabel(e: GraphEdge): string {
  const parts = [];
  if (e.polarity !== "any") parts.push(polarityText(e.polarity));
  const lag = formatLag(e.lag_ms);
  if (lag) parts.push(lag);
  return parts.join("  ");
}

/** Visible edges: approved always; drafts only when requested. Edges to unknown nodes are dropped. */
export function visibleEdges(view: CausalGraphView, showDrafts: boolean): GraphEdge[] {
  const ids = new Set(view.nodes.map((n) => n.id));
  return view.edges.filter((e) => (e.approved || showDrafts) && ids.has(e.from) && ids.has(e.to));
}

export type LayoutDirection = "RIGHT" | "DOWN";

export function toElkGraph(view: CausalGraphView, showDrafts: boolean, direction: LayoutDirection = "RIGHT"): ElkNode {
  const edges = visibleEdges(view, showDrafts);
  return {
    id: "root",
    layoutOptions: { ...ELK_OPTIONS, "elk.direction": direction },
    children: view.nodes.map((n) => ({ id: n.id, width: NODE_W, height: NODE_H })),
    // Labels are placed on the routed segment afterwards (labelAnchor), so ELK does not widen
    // every layer gap to reserve label space — the graph stays legible at fit-to-view.
    edges: edges.map((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })),
  };
}

export interface PlacedGraphNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RoutedEdge {
  id: string;
  points: { x: number; y: number }[];
}

export interface GraphLayout {
  nodes: Record<string, PlacedGraphNode>;
  edges: RoutedEdge[];
  width: number;
  height: number;
}

export function fromElkResult(result: ElkNode): GraphLayout {
  const nodes: Record<string, PlacedGraphNode> = {};
  for (const c of result.children ?? []) {
    nodes[c.id] = { id: c.id, x: c.x ?? 0, y: c.y ?? 0, width: c.width ?? NODE_W, height: c.height ?? NODE_H };
  }
  const edges: RoutedEdge[] = ((result.edges ?? []) as ElkExtendedEdge[]).map((e) => {
    const points: { x: number; y: number }[] = [];
    for (const s of e.sections ?? []) {
      if (!points.length) points.push({ x: s.startPoint.x, y: s.startPoint.y });
      for (const b of s.bendPoints ?? []) points.push({ x: b.x, y: b.y });
      points.push({ x: s.endPoint.x, y: s.endPoint.y });
    }
    return { id: e.id, points };
  });
  return { nodes, edges, width: result.width ?? 0, height: result.height ?? 0 };
}

/** Where to put an edge's label: the middle of its longest segment (above it when horizontal). */
export function labelAnchor(points: { x: number; y: number }[]): { x: number; y: number; horizontal: boolean } | null {
  if (points.length < 2) return null;
  let best = 0;
  let bestLen = -1;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const len = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    if (len > bestLen) {
      bestLen = len;
      best = i;
    }
  }
  const a = points[best]!;
  const b = points[best + 1]!;
  const horizontal = Math.abs(a.y - b.y) < 1;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, horizontal };
}

export function pointsToPath(points: { x: number; y: number }[]): string {
  return points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("");
}

let elkPromise: Promise<{ layout: (g: ElkNode) => Promise<ElkNode> }> | null = null;

/** Scale at which a layout fits a viewport (higher = more legible). */
export function fitScale(layout: Pick<GraphLayout, "width" | "height">, viewport: { width: number; height: number }): number {
  if (!layout.width || !layout.height) return 0;
  return Math.min(viewport.width / layout.width, viewport.height / layout.height);
}

/**
 * elk is ~450 KB; it only ever loads with this route. Lays out left→right and top→down and keeps
 * whichever reads larger in the current viewport (long chains fit better one way or the other).
 */
export async function layoutCausalGraph(
  view: CausalGraphView,
  showDrafts: boolean,
  viewport: { width: number; height: number } = { width: 1200, height: 640 },
): Promise<GraphLayout & { direction: LayoutDirection }> {
  elkPromise ??= import("elkjs/lib/elk.bundled.js").then((m) => new m.default());
  const elk = await elkPromise;
  const [right, down] = await Promise.all(
    (["RIGHT", "DOWN"] as const).map(async (d) => ({ ...fromElkResult(await elk.layout(toElkGraph(view, showDrafts, d))), direction: d })),
  );
  return fitScale(down!, viewport) > fitScale(right!, viewport) * 1.15 ? down! : right!;
}

// ---- Feedback loops --------------------------------------------------------------------------

export interface LoopGroup {
  id: string;
  members: string[];
  edgeIds: string[];
  /** Product of edge polarities around the loop. */
  polarity: "reinforcing" | "balancing" | "unknown";
  lag: [number, number] | null;
}

/**
 * Loop groups from the runtime's strongly-connected components, named by the engineer's loop_id
 * when the member edges carry one. Polarity: an even number of "−" edges reinforces, odd balances.
 */
export function loopGroups(view: CausalGraphView): LoopGroup[] {
  return view.feedback_loops
    .filter((m) => m.length > 1)
    .map((members, i) => {
      const set = new Set(members);
      const edges = view.edges.filter((e) => e.approved && set.has(e.from) && set.has(e.to));
      const loopId = edges.find((e) => e.loop_id)?.loop_id ?? `Loop ${i + 1}`;
      let polarity: LoopGroup["polarity"] = "reinforcing";
      let negatives = 0;
      for (const e of edges) {
        if (e.polarity === "any") polarity = "unknown";
        if (e.polarity === "-") negatives += 1;
      }
      if (polarity !== "unknown") polarity = negatives % 2 === 0 ? "reinforcing" : "balancing";
      const lags = edges.map((e) => e.lag_ms).filter((l): l is [number, number] => !!l);
      const lag: [number, number] | null = lags.length
        ? [lags.reduce((s, l) => s + l[0], 0), lags.reduce((s, l) => s + l[1], 0)]
        : null;
      return { id: loopId, members, edgeIds: edges.map((e) => e.id), polarity, lag };
    });
}

export function loopBounds(layout: GraphLayout, members: string[], pad = 18): { x: number; y: number; w: number; h: number } | null {
  const placed = members.map((m) => layout.nodes[m]).filter((n): n is PlacedGraphNode => !!n);
  if (!placed.length) return null;
  const x0 = Math.min(...placed.map((n) => n.x)) - pad;
  const y0 = Math.min(...placed.map((n) => n.y)) - pad - 16;
  const x1 = Math.max(...placed.map((n) => n.x + n.width)) + pad;
  const y1 = Math.max(...placed.map((n) => n.y + n.height)) + pad;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
