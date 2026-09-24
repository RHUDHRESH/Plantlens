import { useMemo, useState } from "react";
import type { PatternDetail } from "../../api/v2";
import { formatLagWindow } from "../approvals/diffFormat";
import { pathFor, useGraphLayout } from "../approvals/elkLayout";

type Mechanism = NonNullable<PatternDetail["mechanism"]>;
type Loop = NonNullable<Mechanism["loops"]>[number];

const CHAR_W = 6.7;

function nodeSize(label: string, role?: string) {
  const roleW = role ? (`measured: ${role}`.length * 5.9) : 0;
  return { width: Math.min(240, Math.max(96, Math.round(Math.max(label.length * CHAR_W, roleW) + 26))), height: role ? 46 : 34 };
}

/**
 * Causal mechanism inside the component: signed influence edges laid out with elkjs.
 * Reinforcing (R) and balancing (B) loops use the system-dynamics convention: a loop marker at
 * the loop's centre plus a distinct stroke, with the description in the legend.
 */
export function MechanismDiagram({ mechanism }: { mechanism: Mechanism }) {
  const nodes = useMemo(() => mechanism.nodes ?? [], [mechanism]);
  const edges = useMemo(() => (mechanism.edges ?? []).map((e, i) => ({ ...e, id: `m${i}` })), [mechanism]);
  const loops = mechanism.loops ?? [];
  const [focusLoop, setFocusLoop] = useState<string | null>(null);

  const layoutNodes = useMemo(() => nodes.map((n) => ({ id: n.id, ...nodeSize(n.label, n.role) })), [nodes]);
  const layoutEdges = useMemo(() => edges.map((e) => ({ id: e.id, from: e.from, to: e.to })), [edges]);
  const { layout } = useGraphLayout(layoutNodes, layoutEdges, {
    "elk.direction": "DOWN",
    "elk.layered.spacing.nodeNodeBetweenLayers": "40",
    "elk.spacing.nodeNode": "36",
  });

  const polarity = useMemo(() => new Map(loops.map((l) => [l.loop_id, l.polarity])), [loops]);

  if (!nodes.length) return null;
  if (!layout) return <div className="eng-graph eng-graph--loading" aria-busy="true">Laying out mechanism…</div>;

  const loopCentres: (Loop & { cx: number; cy: number })[] = [];
  const nodeBoxes = Object.values(layout.nodes);
  const hits = (x: number, y: number) =>
    nodeBoxes.some((n) => x > n.x - 16 && x < n.x + n.width + 16 && y > n.y - 16 && y < n.y + n.height + 16);
  for (const l of loops) {
    // Anchor on the loop's own edge routes, then nudge sideways until the marker clears every node.
    const pts = edges.filter((e) => e.loop_id === l.loop_id).flatMap((e) => layout.edges[e.id]?.points ?? []);
    if (!pts.length) continue;
    let cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const maxX = Math.max(...pts.map((p) => p.x));
    for (let step = 0; step < 12 && hits(cx, cy); step += 1) cx += 18;
    if (hits(cx, cy)) cx = maxX + 22;
    loopCentres.push({ ...l, cx, cy });
  }

  const w = Math.max(layout.width, 240);
  const h = Math.max(layout.height, 80);
  const label = `Mechanism: ${edges
    .map((e) => `${nodes.find((n) => n.id === e.from)?.label ?? e.from} ${e.sign === "-" ? "decreases" : "increases"} ${nodes.find((n) => n.id === e.to)?.label ?? e.to}`)
    .join("; ")}`;

  return (
    <div className="plib-mech">
      <div className="eng-graph plib-mech__canvas">
        <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={label} className="eng-graph__svg">
          <defs>
            <marker id="plib-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="plib-mech__head" />
            </marker>
            <marker id="plib-arr-r" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="plib-mech__head plib-mech__head--r" />
            </marker>
          </defs>
          {edges.map((e) => {
            const le = layout.edges[e.id];
            if (!le) return null;
            const pol = e.loop_id ? polarity.get(e.loop_id) : undefined;
            const dim = focusLoop && e.loop_id !== focusLoop;
            const mid = le.points[Math.floor((le.points.length - 1) / 2)]!;
            const next = le.points[Math.floor((le.points.length - 1) / 2) + 1] ?? mid;
            const mx = (mid.x + next.x) / 2;
            const my = (mid.y + next.y) / 2;
            return (
              <g
                key={e.id}
                className={`plib-mech__edge${pol ? ` plib-mech__edge--${pol}` : ""}${dim ? " is-dim" : ""}`}
              >
                <path d={pathFor(le.points)} markerEnd={pol === "reinforcing" ? "url(#plib-arr-r)" : "url(#plib-arr)"} />
                <g transform={`translate(${mx},${my})`} className="plib-mech__sign">
                  <circle r={8} />
                  <text y={4} textAnchor="middle">{e.sign === "-" ? "−" : "+"}</text>
                </g>
                {e.lag_ms && e.lag_ms[1] > 0 ? (
                  <text x={mx + 13} y={my + 4} textAnchor="start" className="plib-mech__lag">
                    {formatLagWindow(e.lag_ms)}
                  </text>
                ) : null}
              </g>
            );
          })}
          {nodes.map((n) => {
            const ln = layout.nodes[n.id];
            if (!ln) return null;
            const inFocus = !focusLoop || edges.some((e) => e.loop_id === focusLoop && (e.from === n.id || e.to === n.id));
            return (
              <g
                key={n.id}
                transform={`translate(${ln.x},${ln.y})`}
                className={`plib-mech__node plib-mech__node--${n.kind ?? "state"}${inFocus ? "" : " is-dim"}`}
              >
                <rect width={ln.width} height={ln.height} rx={n.kind === "symptom" ? ln.height / 2 : 6} />
                <text x={ln.width / 2} y={n.role ? 18 : ln.height / 2 + 4} textAnchor="middle" className="plib-mech__label">
                  {n.label}
                </text>
                {n.role ? (
                  <text x={ln.width / 2} y={35} textAnchor="middle" className="plib-mech__role">
                    measured: {n.role}
                  </text>
                ) : null}
              </g>
            );
          })}
          {loopCentres.map((l) => (
            <g key={l.loop_id} transform={`translate(${l.cx},${l.cy})`} className={`plib-mech__loop plib-mech__loop--${l.polarity}`}>
              <circle r={13} />
              <text y={4.5} textAnchor="middle">{l.polarity === "reinforcing" ? "R" : "B"}</text>
            </g>
          ))}
        </svg>
      </div>
      <div className="plib-mech__legend">
        <span className="plib-mech__key"><span className="plib-mech__keynode plib-mech__keynode--cause" /> cause</span>
        <span className="plib-mech__key"><span className="plib-mech__keynode" /> internal state</span>
        <span className="plib-mech__key"><span className="plib-mech__keynode plib-mech__keynode--symptom" /> observable symptom</span>
        <span className="plib-mech__key"><span className="plib-mech__keysign">+</span> same direction</span>
        <span className="plib-mech__key"><span className="plib-mech__keysign">−</span> opposite direction</span>
      </div>
      {loops.length ? (
        <ul className="plib-loops" aria-label="Feedback loops">
          {loops.map((l) => (
            <li key={l.loop_id}>
              <button
                type="button"
                className={`plib-loop plib-loop--${l.polarity}`}
                aria-pressed={focusLoop === l.loop_id}
                onClick={() => setFocusLoop((f) => (f === l.loop_id ? null : l.loop_id))}
                onMouseEnter={() => setFocusLoop(l.loop_id)}
                onMouseLeave={() => setFocusLoop(null)}
              >
                <span className="plib-loop__badge" aria-hidden>{l.polarity === "reinforcing" ? "R" : "B"}</span>
                <span className="plib-loop__text">
                  <strong>
                    {l.polarity === "reinforcing" ? "Reinforcing" : "Balancing"} loop · <span className="pl-mono">{l.loop_id}</span>
                  </strong>
                  <span>{l.description}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
