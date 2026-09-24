/**
 * Legacy runtime-HMI 3D map API, now rendered by the plant3d engine (realistic component models,
 * routed cable trays, status outlines). Keeps the PlantMap3DProps / viewport-controls contract
 * used by RuntimeHMI. Loaded lazily through LazyPlantMap3D.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssetStatus } from "../maps2d/mapTypes";
import type { MapLayerId, MapZoomBand, UserRole } from "../operational-map";
import type { Map3DEdge, Map3DNode } from "../ops3d/map3dTypes";
import type { CameraCommand, CameraCommandInput } from "../plant3d/lib/camera";
import { buildPlantLayout } from "../plant3d/lib/layout";
import PlantScene from "../plant3d/scene/PlantScene";
import "../plant3d/plant3d.css";
import { getSceneScaleBand, scaleFromDistance } from "./sceneMath3D";

export interface PlantMap3DViewportControls {
  fitPlant: () => void;
  focusRoot: () => void;
  focusAsset: (assetId: string) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  scale: number;
  zoomBand: MapZoomBand;
}

export interface PlantMap3DProps {
  nodes: Map3DNode[];
  edges: Map3DEdge[];
  assetStatus: Record<string, AssetStatus>;
  causalPath?: string[];
  rootAssetId?: string | null;
  selectedAssetId?: string | null;
  focusAssetId?: string | null;
  role?: UserRole;
  zoomBand?: MapZoomBand;
  visibleLayers?: Record<MapLayerId, boolean>;
  reducedMotion?: boolean;
  onSelectAsset?: (id: string) => void;
  onViewportReady?: (controls: PlantMap3DViewportControls) => void;
  onZoomBandChange?: (band: MapZoomBand) => void;
}

export function PlantMap3D({
  nodes,
  edges,
  assetStatus,
  causalPath,
  rootAssetId,
  selectedAssetId,
  focusAssetId,
  visibleLayers,
  reducedMotion,
  onSelectAsset,
  onViewportReady,
  onZoomBandChange,
}: PlantMap3DProps) {
  const layout = useMemo(() => buildPlantLayout(nodes), [nodes]);
  const [command, setCommand] = useState<CameraCommand | null>(null);
  const [view, setView] = useState<{ scale: number; zoomBand: MapZoomBand }>({ scale: 1, zoomBand: "plant" });
  const bandRef = useRef<MapZoomBand>("plant");
  const send = useCallback((c: CameraCommandInput) => setCommand({ ...c, nonce: Date.now() + Math.random() } as CameraCommand), []);

  const controls = useMemo<PlantMap3DViewportControls>(
    () => ({
      fitPlant: () => send({ type: "fit" }),
      focusRoot: () => (rootAssetId ? send({ type: "focus", id: rootAssetId }) : send({ type: "fit" })),
      focusAsset: (id: string) => send({ type: "focus", id }),
      zoomIn: () => send({ type: "zoom", factor: 0.8 }),
      zoomOut: () => send({ type: "zoom", factor: 1.25 }),
      scale: view.scale,
      zoomBand: view.zoomBand,
    }),
    [send, rootAssetId, view],
  );

  useEffect(() => {
    onViewportReady?.(controls);
  }, [onViewportReady, controls]);

  useEffect(() => {
    if (focusAssetId) send({ type: "focus", id: focusAssetId });
  }, [focusAssetId, send]);

  const onDistance = useCallback(
    (distance: number, fit: number) => {
      const band = getSceneScaleBand(distance, fit);
      if (band !== bandRef.current) {
        bandRef.current = band;
        onZoomBandChange?.(band);
        setView({ scale: scaleFromDistance(distance, fit), zoomBand: band });
      }
    },
    [onZoomBandChange],
  );

  const showCausalPath = visibleLayers?.causal_path ?? true;
  const statusById = useMemo(() => {
    const out: Record<string, AssetStatus> = {};
    for (const n of nodes) out[n.id] = assetStatus[n.id] ?? "unknown";
    return out;
  }, [nodes, assetStatus]);

  return (
    <div className="plant-map-3d plant-map-3d__hud plant3d" role="img" aria-label="3D plant view">
      <PlantScene
        layout={layout}
        edges={edges}
        assetStatus={statusById}
        selectedId={selectedAssetId ?? null}
        command={command}
        reducedMotion={!!reducedMotion}
        highlightIds={showCausalPath ? causalPath ?? [] : []}
        showLabels={visibleLayers?.status ?? true}
        onSelect={(id) => {
          if (id) onSelectAsset?.(id);
        }}
        onDistance={onDistance}
      />
    </div>
  );
}

export function PlantMap3DFallback({ onSwitch2D }: { onSwitch2D: () => void }) {
  return (
    <div className="map3d-fallback" role="status">
      <p>3D view unavailable — WebGL is disabled or failed to initialize.</p>
      <button type="button" onClick={onSwitch2D}>
        Return to 2D map
      </button>
    </div>
  );
}
