import { Suspense, useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import type { AssetStatus } from "../maps2d/mapTypes";
import { statusForAsset } from "../maps2d/statusStyles";
import type { MapLayerId, MapZoomBand, UserRole } from "../operational-map";
import type { Map3DEdge, Map3DNode } from "../ops3d/map3dTypes";
import { SchematicAssetMesh } from "./AssetMeshes";
import {
  useOperationalCamera3D,
  type PlantMap3DViewportControls,
} from "./useOperationalCamera3D";

export type { PlantMap3DViewportControls };

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

function PowerCable({
  from,
  to,
  highlight,
}: {
  from: [number, number, number];
  to: [number, number, number];
  highlight: boolean;
}) {
  const mid: [number, number, number] = [
    (from[0] + to[0]) / 2,
    (from[1] + to[1]) / 2,
    (from[2] + to[2]) / 2,
  ];
  return (
    <Line
      points={[from, mid, to]}
      color={highlight ? "#1cc8ff" : "#1a3a5c"}
      lineWidth={highlight ? 2.5 : 1}
    />
  );
}

function PlantScene({
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
  const { controls, controlsRef, sceneFit, onControlsChange } = useOperationalCamera3D({
    nodes,
    rootAssetId: rootAssetId ?? null,
    focusAssetId: focusAssetId ?? null,
    reducedMotion: !!reducedMotion,
    ...(onZoomBandChange ? { onZoomBandChange } : {}),
  });

  useEffect(() => {
    onViewportReady?.(controls);
  }, [onViewportReady, controls]);

  const positions = useMemo(
    () =>
      Object.fromEntries(
        nodes.map((n) => [
          n.id,
          { x: n.position.x, y: n.position.y, z: n.position.z },
        ]),
      ),
    [nodes],
  );

  const showCausalPath = visibleLayers?.causal_path ?? true;
  const pathSet = useMemo(
    () => (showCausalPath ? new Set(causalPath ?? []) : new Set<string>()),
    [causalPath, showCausalPath],
  );
  const pathSteps = useMemo(
    () =>
      showCausalPath
        ? Object.fromEntries((causalPath ?? []).map((id, i) => [id, i + 1]))
        : {},
    [causalPath, showCausalPath],
  );

  const maxControlDistance = Math.max(sceneFit.radius * 5, 14);

  return (
    <>
      <color attach="background" args={["#08111f"]} />
      <ambientLight intensity={0.15} color="#0a2040" />
      <hemisphereLight args={["#0d2a4a", "#050e1a", 0.35]} />
      <directionalLight position={[4, 8, 3]} intensity={0.7} color="#d0eeff" castShadow />
      <pointLight position={[0, 4, 0]} intensity={0.4} color="#1cc8ff" distance={12} />
      <gridHelper args={[14, 28, "rgba(28,200,255,0.15)", "rgba(28,200,255,0.05)"]} position={[0, 0, 0]} />
      {edges.map((edge) => {
        const a = positions[edge.from];
        const b = positions[edge.to];
        if (!a || !b) return null;
        const highlight = showCausalPath && pathSet.has(edge.from) && pathSet.has(edge.to);
        return (
          <PowerCable
            key={edge.id}
            from={[a.x, a.y, a.z]}
            to={[b.x, b.y, b.z]}
            highlight={highlight}
          />
        );
      })}
      {nodes.map((node) => {
        const step = pathSteps[node.id];
        const meshProps = {
          key: node.id,
          node,
          status: statusForAsset(node.id, assetStatus),
          isRoot: node.id === rootAssetId,
          isSelected: node.id === selectedAssetId,
          isFocused: node.id === focusAssetId,
          isOnPath: pathSet.has(node.id),
          reducedMotion: !!reducedMotion,
          layerHints: {
            showCausalStep: showCausalPath,
            showStatus: visibleLayers?.status ?? true,
          },
          ...(step !== undefined ? { pathStep: step } : {}),
          ...(onSelectAsset ? { onSelect: onSelectAsset } : {}),
        };
        return <SchematicAssetMesh {...meshProps} />;
      })}
      {/* tags, audit, maintenance: no 3D overlays yet — layer toggles are honored by omission */}
      <OrbitControls
        ref={controlsRef}
        minDistance={Math.max(sceneFit.radius * 0.25, 0.75)}
        maxDistance={maxControlDistance}
        enableDamping={!reducedMotion}
        dampingFactor={0.08}
        onChange={onControlsChange}
      />
    </>
  );
}

export function PlantMap3D(props: PlantMap3DProps) {
  return (
    <div className="plant-map-3d plant-map-3d__hud" role="img" aria-label="3D plant schematic">
      <Canvas camera={{ position: [3, 3, 3], fov: 42 }} dpr={[1, 1.5]} shadows>
        <Suspense fallback={null}>
          <PlantScene {...props} />
        </Suspense>
      </Canvas>
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