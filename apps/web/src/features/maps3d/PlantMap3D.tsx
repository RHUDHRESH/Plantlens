import { Suspense, useEffect, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import type { AssetStatus } from "../maps2d/mapTypes";
import { statusForAsset } from "../maps2d/statusStyles";
import type { Map3DEdge, Map3DNode } from "../ops3d/map3dTypes";
import { SchematicAssetMesh } from "./AssetMeshes";

export interface PlantMap3DProps {
  nodes: Map3DNode[];
  edges: Map3DEdge[];
  assetStatus: Record<string, AssetStatus>;
  causalPath?: string[];
  rootAssetId?: string | null;
  reducedMotion?: boolean;
  onSelectAsset?: (id: string) => void;
}

function PowerCable({ from, to, highlight }: { from: [number, number, number]; to: [number, number, number]; highlight: boolean }) {
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

function CameraFocus({
  targetId,
  nodes,
  reducedMotion,
}: {
  targetId: string | null | undefined;
  nodes: Map3DNode[];
  reducedMotion: boolean;
}) {
  const { camera } = useThree();
  const target = nodes.find((n) => n.id === targetId);
  useEffect(() => {
    if (!target?.position) return;
    const { x, y, z } = target.position;
    const duration = reducedMotion ? 0 : 400;
    const start = performance.now();
    const from = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    const to = { x: x + 2, y: y + 2.2, z: z + 2 };
    let frame = 0;
    const tick = (now: number) => {
      const t = reducedMotion ? 1 : Math.min(1, (now - start) / duration);
      camera.position.x = from.x + (to.x - from.x) * t;
      camera.position.y = from.y + (to.y - from.y) * t;
      camera.position.z = from.z + (to.z - from.z) * t;
      camera.lookAt(x, y, z);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [targetId, nodes, camera, reducedMotion, target]);
  return null;
}

function PlantScene({
  nodes,
  edges,
  assetStatus,
  causalPath,
  rootAssetId,
  reducedMotion,
  onSelectAsset,
}: PlantMap3DProps) {
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
  const pathSet = useMemo(() => new Set(causalPath ?? []), [causalPath]);
  const pathSteps = useMemo(
    () => Object.fromEntries((causalPath ?? []).map((id, i) => [id, i + 1])),
    [causalPath],
  );

  return (
    <>
      <color attach="background" args={["#08111f"]} />
      <ambientLight intensity={0.15} color="#0a2040" />
      <hemisphereLight args={["#0d2a4a", "#050e1a", 0.35]} />
      <directionalLight position={[4, 8, 3]} intensity={0.7} color="#d0eeff" castShadow />
      <pointLight position={[0, 4, 0]} intensity={0.4} color="#1cc8ff" distance={12} />
      <gridHelper args={[14, 28, "rgba(28,200,255,0.15)", "rgba(28,200,255,0.05)"]} position={[0, 0, 0]} />
      <CameraFocus targetId={rootAssetId} nodes={nodes} reducedMotion={!!reducedMotion} />
      {edges.map((edge) => {
        const a = positions[edge.from];
        const b = positions[edge.to];
        if (!a || !b) return null;
        const highlight = pathSet.has(edge.from) && pathSet.has(edge.to);
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
          isOnPath: pathSet.has(node.id),
          reducedMotion: !!reducedMotion,
          ...(step !== undefined ? { pathStep: step } : {}),
          ...(onSelectAsset ? { onSelect: onSelectAsset } : {}),
        };
        return <SchematicAssetMesh {...meshProps} />;
      })}
      <OrbitControls
        minDistance={1.5}
        maxDistance={14}
        enableDamping={!reducedMotion}
        dampingFactor={0.08}
      />
    </>
  );
}

export function PlantMap3D(props: PlantMap3DProps) {
  return (
    <div className="plant-map-3d" role="img" aria-label="3D plant schematic">
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