import { useEffect, useMemo } from "react";
import type { ActiveAlarm } from "../../api/types";
import type { TagFrame } from "../../app/schemas/tagFrame";
import {
  getMapNodeDetailPolicy,
  type MapLayerId,
  type MapZoomBand,
  type UserRole,
} from "../operational-map";
import type { MapEdge, MapNode } from "./mapTypes";
import { buildNodeOperationalMeta } from "./nodeOperationalMeta";
import { CausalPathOverlay } from "./CausalPathOverlay";
import { MapLegend } from "./MapLegend";
import { PlantEdge } from "./PlantEdge";
import { PlantNode } from "./PlantNode";
import { statusForAsset } from "./statusStyles";
import { useSvgViewport } from "./useSvgViewport";

export interface PlantMap2DViewportControls {
  fitPlant: () => void;
  focusRoot: () => void;
  focusAsset: (assetId: string) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  scale: number;
  zoomBand: MapZoomBand;
}

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
  onViewportReady?: (controls: PlantMap2DViewportControls) => void;
  onZoomBandChange?: (band: MapZoomBand) => void;
  role?: UserRole;
  zoomBand?: MapZoomBand;
  visibleLayers?: Record<MapLayerId, boolean>;
  tags?: Record<string, TagFrame>;
  alarms?: ActiveAlarm[];
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
  onViewportReady,
  onZoomBandChange,
  role = "operator",
  zoomBand: zoomBandProp,
  visibleLayers,
  tags = {},
  alarms = [],
}: PlantMap2DProps) {
  const viewport = useSvgViewport({
    nodes,
    focusAssetId: focusAssetId ?? null,
    rootAssetId: rootAssetId ?? null,
    reducedMotion,
    ...(onZoomBandChange ? { onZoomBandChange } : {}),
  });

  const viewportControls = useMemo<PlantMap2DViewportControls>(
    () => ({
      fitPlant: viewport.fitPlant,
      focusRoot: viewport.focusRoot,
      focusAsset: viewport.focusAsset,
      zoomIn: viewport.zoomIn,
      zoomOut: viewport.zoomOut,
      scale: viewport.scale,
      zoomBand: viewport.zoomBand,
    }),
    [
      viewport.fitPlant,
      viewport.focusRoot,
      viewport.focusAsset,
      viewport.zoomIn,
      viewport.zoomOut,
      viewport.scale,
      viewport.zoomBand,
    ],
  );

  useEffect(() => {
    onViewportReady?.(viewportControls);
  }, [onViewportReady, viewportControls]);

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

  const effectiveZoomBand = zoomBandProp ?? viewport.zoomBand;
  const detailPolicy = useMemo(
    () =>
      getMapNodeDetailPolicy({
        role,
        zoomBand: effectiveZoomBand,
        visibleLayers: visibleLayers ?? {
          status: true,
          causal_path: true,
          raw_alarms: true,
          tags: false,
          actions: true,
          maintenance: false,
          audit: false,
          geometry: true,
        },
      }),
    [role, effectiveZoomBand, visibleLayers],
  );

  const nodeMeta = useMemo(
    () =>
      buildNodeOperationalMeta({
        assetIds: nodes.map((n) => n.id),
        tags,
        alarms,
      }),
    [nodes, tags, alarms],
  );

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
        ref={viewport.svgRef}
        viewBox={viewport.viewBoxString}
        className={`plant-map-2d${viewport.isPanning ? " plant-map-2d--panning" : ""}`}
        role="img"
        aria-label="Live plant map"
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={viewport.onPointerDown}
        onPointerMove={viewport.onPointerMove}
        onPointerUp={viewport.onPointerUp}
        onPointerLeave={viewport.onPointerLeave}
        onWheel={viewport.onWheel}
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
            detailPolicy={detailPolicy}
            zoomBand={effectiveZoomBand}
            {...(nodeMeta[node.id] ? { meta: nodeMeta[node.id] } : {})}
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