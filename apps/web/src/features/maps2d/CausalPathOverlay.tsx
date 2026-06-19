import type { MapNode } from "./mapTypes";

interface CausalPathOverlayProps {
  nodes: MapNode[];
  causalPath: string[];
}

/** Numbered step markers along the backend causal path — no local inference. */
export function CausalPathOverlay({ nodes, causalPath }: CausalPathOverlayProps) {
  if (!causalPath.length) return null;
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

  return (
    <g aria-label="Causal path overlay">
      {causalPath.map((assetId, index) => {
        const node = byId[assetId];
        if (!node?.position) return null;
        const step = index + 1;
        return (
          <g key={`${assetId}-${step}`} transform={`translate(${node.position.x}, ${node.position.y - 42})`}>
            <rect
              x={-14}
              y={-12}
              width={28}
              height={20}
              rx={4}
              fill="var(--surface)"
              stroke="var(--accent)"
              strokeWidth={1.5}
            />
            <text
              x={0}
              y={2}
              textAnchor="middle"
              fill="var(--accent)"
              fontSize={12}
              fontWeight={700}
              data-tabular
            >
              {step}
            </text>
          </g>
        );
      })}
    </g>
  );
}