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
      style={reducedMotion ? undefined : { transition: "stroke 300ms, stroke-width 300ms" }}
    />
  );
}