import type { TrendPoint } from "../../api/v2";
import { formatValue } from "./format";

export interface SparkLimit {
  value: number;
  label: string;
  tone: "critical" | "high" | "medium";
}

/**
 * Lightweight SVG sparkline (sample-and-hold) for drawers and tables — keeps uPlot out of the
 * Overview and Alarms chunks. Non-GOOD samples break the line (gap) and get a tick at the base.
 */
export function Sparkline({
  points,
  fromMs,
  toMs,
  unit,
  limits = [],
  width = 280,
  height = 56,
  label,
}: {
  points: TrendPoint[];
  fromMs: number;
  toMs: number;
  unit?: string | null;
  limits?: SparkLimit[];
  width?: number;
  height?: number;
  label: string;
}) {
  const samples = points
    .map(([ts, v, q]) => ({ t: Date.parse(ts), v, q }))
    .filter((p) => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);
  const values = samples.filter((p) => p.q === "GOOD" && typeof p.v === "number").map((p) => p.v as number);
  for (const l of limits) values.push(l.value);
  const pad = 4;
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 1;
  const span = hi - lo || Math.abs(hi) || 1;
  const yMin = lo - span * 0.12;
  const yMax = hi + span * 0.12;
  const x = (t: number) => pad + ((t - fromMs) / Math.max(1, toMs - fromMs)) * (width - pad * 2);
  const y = (v: number) => pad + (1 - (v - yMin) / (yMax - yMin)) * (height - pad * 2 - 4);

  // Step path: hold each GOOD value until the next sample (or "now"); gaps at non-GOOD samples.
  let d = "";
  let open = false;
  samples.forEach((p, i) => {
    const next = samples[i + 1];
    const endT = Math.min(next ? next.t : toMs, toMs);
    if (p.q !== "GOOD" || typeof p.v !== "number") {
      open = false;
      return;
    }
    const px = Math.max(pad, x(p.t));
    const py = y(p.v);
    d += open ? `L${px.toFixed(1)},${py.toFixed(1)}` : `M${px.toFixed(1)},${py.toFixed(1)}`;
    d += `L${x(endT).toFixed(1)},${py.toFixed(1)}`;
    open = true;
  });
  const last = [...samples].reverse().find((p) => p.q === "GOOD" && typeof p.v === "number");
  const bad = samples.filter((p) => p.q !== "GOOD");

  if (!samples.length) {
    return (
      <div className="ops-spark ops-spark--empty" style={{ height }}>
        No samples in this window
      </div>
    );
  }

  return (
    <svg
      className="ops-spark"
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${label}: ${samples.length} samples${last ? `, last ${formatValue(last.v, unit)}` : ""}`}
    >
      {limits.map((l) => (
        <line
          key={`${l.label}-${l.value}`}
          className={`ops-spark__limit ops-spark__limit--${l.tone}`}
          x1={pad}
          x2={width - pad}
          y1={y(l.value)}
          y2={y(l.value)}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {d ? <path className="ops-spark__line" d={d} vectorEffect="non-scaling-stroke" /> : null}
      {bad.map((p) => (
        <rect key={p.t} className="ops-spark__bad" x={x(p.t) - 1} y={height - 4} width={2} height={4} />
      ))}
    </svg>
  );
}
