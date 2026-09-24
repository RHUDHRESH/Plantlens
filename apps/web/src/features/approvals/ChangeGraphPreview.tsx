import { useMemo } from "react";
import type { EntityDiff } from "../../api/v2";
import { affectedGraph } from "./diffFormat";
import type { EdgeLike } from "./diffFormat";
import { pathFor, useGraphLayout } from "./elkLayout";

const NODE_W = 112;
const NODE_H = 34;

/** Read-only SVG preview of the causal-graph neighbourhood a change touches; additions highlighted. */
export function ChangeGraphPreview({
  diff,
  lookupEdge,
}: {
  diff: readonly EntityDiff[];
  lookupEdge?: (id: string) => EdgeLike | undefined;
}) {
  const graph = useMemo(() => affectedGraph(diff, lookupEdge), [diff, lookupEdge]);
  const layoutNodes = useMemo(() => graph.nodes.map((n) => ({ id: n.id, width: NODE_W, height: NODE_H })), [graph]);
  const layoutEdges = useMemo(() => graph.edges.map((e) => ({ id: e.id, from: e.from, to: e.to })), [graph]);
  const { layout } = useGraphLayout(layoutNodes, layoutEdges, { "elk.layered.spacing.nodeNodeBetweenLayers": "170" });

  if (!graph.nodes.length) {
    return <p className="eng-muted">This change does not touch the causal graph structure.</p>;
  }
  if (!layout) return <div className="eng-graph eng-graph--loading" aria-busy="true">Laying out…</div>;

  const w = Math.max(layout.width, 200);
  const h = Math.max(layout.height, 60);
  const summary = `${graph.nodes.length} nodes and ${graph.edges.length} edges affected: ${graph.edges
    .map((e) => `${e.state} ${e.from} to ${e.to}`)
    .join("; ")}`;

  return (
    <figure className="eng-graph">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={summary} className="eng-graph__svg">
        <defs>
          <marker id="eng-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="eng-graph__arrowhead" />
          </marker>
          <marker id="eng-arrow-add" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="eng-graph__arrowhead eng-graph__arrowhead--added" />
          </marker>
        </defs>
        {graph.edges.map((e) => {
          const le = layout.edges[e.id];
          if (!le) return null;
          const i = Math.max(0, Math.floor((le.points.length - 1) / 2));
          const a = le.points[i]!;
          const b = le.points[i + 1] ?? a;
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          return (
            <g key={e.id} className={`eng-graph__edge eng-graph__edge--${e.state}`}>
              <path d={pathFor(le.points)} markerEnd={e.state === "removed" ? "url(#eng-arrow)" : "url(#eng-arrow-add)"} />
              <text x={mid.x} y={mid.y - 6} textAnchor="middle" className="eng-graph__label">
                {e.label}
                {e.loop ? " · loop" : ""}
              </text>
            </g>
          );
        })}
        {graph.nodes.map((n) => {
          const ln = layout.nodes[n.id];
          if (!ln) return null;
          return (
            <g key={n.id} className={`eng-graph__node eng-graph__node--${n.state}`} transform={`translate(${ln.x},${ln.y})`}>
              <rect width={ln.width} height={ln.height} rx={6} />
              <text x={ln.width / 2} y={ln.height / 2 + 4} textAnchor="middle">
                {n.id}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="eng-graph__legend">
        <span><i className="eng-swatch eng-swatch--added" /> proposed</span>
        <span><i className="eng-swatch eng-swatch--changed" /> modified</span>
        <span><i className="eng-swatch eng-swatch--removed" /> removed</span>
        <span><i className="eng-swatch eng-swatch--context" /> existing node</span>
      </figcaption>
    </figure>
  );
}
