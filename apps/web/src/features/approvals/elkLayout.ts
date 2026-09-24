/**
 * Small elkjs wrapper for the read-only engineering diagrams (mechanism diagrams, change-set
 * preview graphs). Layered left→right layout, orthogonal-ish routing, deterministic output.
 */
import { useEffect, useState } from "react";
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";

export interface LayoutInputNode {
  id: string;
  width: number;
  height: number;
}

export interface LayoutInputEdge {
  id: string;
  from: string;
  to: string;
}

export interface LaidOutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LaidOutEdge {
  id: string;
  points: { x: number; y: number }[];
}

export interface GraphLayout {
  width: number;
  height: number;
  nodes: Record<string, LaidOutNode>;
  edges: Record<string, LaidOutEdge>;
}

type ElkInstance = { layout: (graph: ElkNode) => Promise<ElkNode> };
let elkPromise: Promise<ElkInstance> | null = null;

function getElk(): Promise<ElkInstance> {
  if (!elkPromise) {
    elkPromise = import("elkjs/lib/elk.bundled.js").then((m) => {
      const Ctor = (m as unknown as { default: new () => ElkInstance }).default;
      return new Ctor();
    });
  }
  return elkPromise;
}

export async function layoutGraph(
  nodes: readonly LayoutInputNode[],
  edges: readonly LayoutInputEdge[],
  options: Record<string, string> = {},
): Promise<GraphLayout> {
  const elk = await getElk();
  const ids = new Set(nodes.map((n) => n.id));
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.spacing.nodeNodeBetweenLayers": "56",
      "elk.spacing.nodeNode": "28",
      "elk.spacing.edgeNode": "18",
      "elk.layered.cycleBreaking.strategy": "DEPTH_FIRST",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.padding": "[top=12,left=12,bottom=12,right=12]",
      ...options,
    },
    children: nodes.map((n) => ({ id: n.id, width: n.width, height: n.height })),
    edges: edges
      .filter((e) => ids.has(e.from) && ids.has(e.to))
      .map<ElkExtendedEdge>((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })),
  };
  const out = await elk.layout(graph);
  const laidNodes: Record<string, LaidOutNode> = {};
  for (const c of out.children ?? []) {
    laidNodes[c.id] = { id: c.id, x: c.x ?? 0, y: c.y ?? 0, width: c.width ?? 0, height: c.height ?? 0 };
  }
  const laidEdges: Record<string, LaidOutEdge> = {};
  for (const e of (out.edges ?? []) as ElkExtendedEdge[]) {
    const s = e.sections?.[0];
    if (!s) continue;
    laidEdges[e.id] = { id: e.id, points: [s.startPoint, ...(s.bendPoints ?? []), s.endPoint] };
  }
  return { width: out.width ?? 0, height: out.height ?? 0, nodes: laidNodes, edges: laidEdges };
}

/** Straight-line fallback between node centres (used before layout resolves or when elk fails). */
export function fallbackLayout(nodes: readonly LayoutInputNode[], edges: readonly LayoutInputEdge[]): GraphLayout {
  const gap = 40;
  let x = 12;
  const laid: Record<string, LaidOutNode> = {};
  for (const n of nodes) {
    laid[n.id] = { id: n.id, x, y: 12, width: n.width, height: n.height };
    x += n.width + gap;
  }
  const height = Math.max(0, ...nodes.map((n) => n.height)) + 24;
  const laidEdges: Record<string, LaidOutEdge> = {};
  for (const e of edges) {
    const a = laid[e.from];
    const b = laid[e.to];
    if (!a || !b) continue;
    laidEdges[e.id] = {
      id: e.id,
      points: [
        { x: a.x + a.width, y: a.y + a.height / 2 },
        { x: b.x, y: b.y + b.height / 2 },
      ],
    };
  }
  return { width: x, height, nodes: laid, edges: laidEdges };
}

/** Lays out once per structural key; returns null until the async layout resolves. */
export function useGraphLayout(
  nodes: readonly LayoutInputNode[],
  edges: readonly LayoutInputEdge[],
  options?: Record<string, string>,
): { layout: GraphLayout | null; error: boolean } {
  const key = JSON.stringify([nodes, edges, options ?? null]);
  const [state, setState] = useState<{ key: string; layout: GraphLayout | null; error: boolean }>({ key: "", layout: null, error: false });
  useEffect(() => {
    let alive = true;
    layoutGraph(nodes, edges, options)
      .then((layout) => alive && setState({ key, layout, error: false }))
      .catch(() => alive && setState({ key, layout: fallbackLayout(nodes, edges), error: true }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? { layout: state.layout, error: state.error } : { layout: null, error: false };
}

/** SVG path through elk points; a smooth Catmull-Rom-ish curve when there are bend points. */
export function pathFor(points: readonly { x: number; y: number }[]): string {
  if (!points.length) return "";
  const [first, ...rest] = points;
  if (rest.length <= 1) return `M${first!.x},${first!.y} ${rest.map((p) => `L${p.x},${p.y}`).join(" ")}`;
  let d = `M${first!.x},${first!.y}`;
  for (let i = 0; i < rest.length; i += 1) {
    const p = rest[i]!;
    const prev = i === 0 ? first! : rest[i - 1]!;
    const mx = (prev.x + p.x) / 2;
    const my = (prev.y + p.y) / 2;
    d += i === rest.length - 1 ? ` Q${prev.x},${prev.y} ${p.x},${p.y}` : ` Q${prev.x},${prev.y} ${mx},${my}`;
  }
  return d;
}
