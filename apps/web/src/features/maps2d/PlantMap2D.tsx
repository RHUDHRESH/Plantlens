import { useMemo } from "react";
import type { MapEdge, MapNode } from "./mapTypes";
import { CausalPathOverlay } from "./CausalPathOverlay";
import { MapLegend } from "./MapLegend";
import { PlantEdge } from "./PlantEdge";
import { PlantNode } from "./PlantNode";
import { statusForAsset } from "./statusStyles";

export interface PlantMap2DProps {
  nodes: MapNode[];
  edges: MapEdge[];
  assetStatus: Record<string, import("./mapTypes").AssetStatus>;
  causalPath?: string[];
  rootAssetId?: string | null;
  affectedAssetIds?: string[];
  reducedMotion?: boolean;
  showLegend?: boolean;
  focusAssetId?: string | null;
  density?: "comfortable" | "compact";
  onSelectAsset?: (id: string) => void;
}

function computeViewBox(nodes: MapNode[]): string {
  if (!nodes.length) return "0 0 800 400";
  const xs = nodes.map((n) => n.position?.x ?? 0);
  const ys = nodes.map((n) => n.position?.y ?? 0);
  const pad = 80;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + pad;
  const maxY = Math.max(...ys) + pad;
  return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
}

export function PlantMap2D({
  nodes,
  edges,
  assetStatus,
  causalPath = [],
  rootAssetId,
  affectedAssetIds = [],
  reducedMotion = false,
  showLegend = true,
  focusAssetId,
  density = "comfortable",
  onSelectAsset,
}: PlantMap2DProps) {
  const positions = useMemo(
    () =>
      Object.fromEntries(
        nodes
          .filter((n) => n.position)
          .map((n) => [n.id, { x: n.position.x, y: n.position.y }]),
      ),
    [nodes],
  );

  const pathSet = useMemo(() => new Set(causalPath), [causalPath]);
  const pathSteps = useMemo(
    () => Object.fromEntries(causalPath.map((id, i) => [id, i + 1])),
    [causalPath],
  );
  const affected = useMemo(() => new Set(affectedAssetIds), [affectedAssetIds]);

  const viewBox = computeViewBox(nodes);

  if (!nodes.length) {
    return (
      <div className="map-empty" role="status">
        No map nodes in compiled HMI — compile the plant bundle first.
      </div>
    );
  }

  const focusNode = focusAssetId ? nodes.find((n) => n.id === focusAssetId) : undefined;

  return (
    <div className={`plant-map-2d-wrap plant-map-2d-wrap--${density}`}>
      {showLegend && <MapLegend reducedMotion={reducedMotion} />}
      <svg
        viewBox={viewBox}
        className="plant-map-2d"
        role="img"
        aria-label="Live plant map"
        preserveAspectRatio="xMidYMid meet"
      >
      <defs>
        <pattern id="grid" width={24} height={24} patternUnits="userSpaceOnUse">
          <path d="M 24 0 L 0 0 0 24" fill="none" stroke="var(--grid)" strokeWidth={0.5} />
        </pattern>
        <pattern id="offline-stripe" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--status-offline)" strokeWidth={1} opacity={0.35} />
        </pattern>
      </defs>
      {/* Dark canvas base */}
      <rect x={-9999} y={-9999} width={20000} height={20000} fill="var(--bg)" />
      <rect x={-9999} y={-9999} width={20000} height={20000} fill="url(#grid)" />
      {edges.map((edge) => {
        const onPath =
          pathSet.has(edge.from) &&
          pathSet.has(edge.to) &&
          Math.abs(causalPath.indexOf(edge.from) - causalPath.indexOf(edge.to)) === 1;
        return (
          <PlantEdge
            key={edge.id}
            edge={edge}
            positions={positions}
            isActivePath={onPath}
            reducedMotion={reducedMotion}
          />
        );
      })}
      <CausalPathOverlay nodes={nodes} causalPath={causalPath} />
      {focusNode?.position && (
        <circle
          cx={focusNode.position.x}
          cy={focusNode.position.y}
          r={density === "compact" ? 52 : 64}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1}
          strokeDasharray="4 4"
          opacity={0.5}
          pointerEvents="none"
        />
      )}
      {nodes.map((node) => {
        const step = pathSteps[node.id];
        const isFocused = node.id === focusAssetId;
        return (
          <PlantNode
            key={node.id}
            node={node}
            status={statusForAsset(node.id, assetStatus)}
            isRoot={node.id === rootAssetId}
            isAffected={affected.has(node.id)}
            isFocused={isFocused}
            density={density}
            {...(step !== undefined ? { pathStep: step } : {})}
            reducedMotion={reducedMotion}
            {...(onSelectAsset ? { onSelect: onSelectAsset } : {})}
          />
        );
      })}
      </svg>
    </div>
  );
}