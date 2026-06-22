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

  return (
    <line
      x1={from.x}
      y1={from.y}
      x2={to.x}
      y2={to.y}
      stroke={stroke}
      strokeWidth={width}
      strokeLinecap="round"
      strokeDasharray={isActivePath ? undefined : "6 4"}
      aria-hidden={!isActivePath}
      {...(isActivePath
        ? { "aria-label": `Active causal path edge ${edge.from} to ${edge.to}` }
        : {})}
      style={reducedMotion ? undefined : { transition: "stroke 300ms, stroke-width 300ms" }}
    />
  );
}