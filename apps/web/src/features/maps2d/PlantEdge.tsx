import type { MapEdge } from "./mapTypes";

interface PlantEdgeProps {
  edge: MapEdge;
  positions: Record<string, { x: number; y: number }>;
  isActivePath?: boolean;
  reducedMotion?: boolean;
}

export function PlantEdge({ edge, positions, isActivePath = false, reducedMotion }: PlantEdgeProps) {
  const from = positions[edge.from];
  const to = positions[edge.to];
  if (!from || !to) return null;

  const stroke = isActivePath ? "var(--accent)" : "var(--grid)";
  const width = isActivePath ? 2.5 : 1.5;
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const label = edge.type.replace(/_/g, " ");

  return (
    <g
      aria-hidden={!isActivePath}
      {...(isActivePath
        ? { "aria-label": `Active causal path edge ${edge.from} to ${edge.to}` }
        : {})}
    >
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={stroke}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={isActivePath ? undefined : "6 4"}
        markerEnd={`url(#${isActivePath ? "map-edge-arrow-active" : "map-edge-arrow"})`}
        style={reducedMotion ? undefined : { transition: "stroke 300ms, stroke-width 300ms" }}
      />
      <g className="plant-edge__label" transform={`translate(${midX}, ${midY - 8})`}>
        <rect x={-34} y={-8} width={68} height={14} rx={3} fill="var(--surface)" opacity={0.86} />
        <text
          textAnchor="middle"
          fill={isActivePath ? "var(--accent)" : "var(--text-muted)"}
          fontSize={8}
          fontWeight={600}
          letterSpacing="0.04em"
        >
          {label.toUpperCase()}
        </text>
      </g>
    </g>
  );
}
