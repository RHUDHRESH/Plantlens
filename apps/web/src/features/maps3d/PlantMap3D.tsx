import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import type { Mesh } from "three";
import type { AssetStatus, MapEdge, MapNode } from "../maps2d/mapTypes";
import { statusForAsset } from "../maps2d/statusStyles";

export interface PlantMap3DProps {
  nodes: MapNode[];
  edges: MapEdge[];
  assetStatus: Record<string, AssetStatus>;
  causalPath?: string[];
  rootAssetId?: string | null;
  reducedMotion?: boolean;
  onSelectAsset?: (id: string) => void;
}

const STATUS_COLOR: Record<AssetStatus, string> = {
  normal: "#3d5a4c",
  warning: "#b8860b",
  critical: "#8b2942",
  sensor_bad: "#5c5c5c",
  offline: "#4a4a4a",
  unknown: "#4a4a4a",
};

function statusColor(status: AssetStatus): string {
  return STATUS_COLOR[status];
}

function AssetMesh({
  node,
  status,
  isRoot,
  isOnPath,
  reducedMotion,
  onSelect,
}: {
  node: MapNode;
  status: AssetStatus;
  isRoot: boolean;
  isOnPath: boolean;
  reducedMotion: boolean;
  onSelect?: ((id: string) => void) | undefined;
}) {
  const meshRef = useRef<Mesh>(null);
  const color = statusColor(status);
  const emissive = isRoot ? "#8b2942" : isOnPath ? "#b8860b" : "#000000";
  const intensity = isRoot ? 0.35 : isOnPath ? 0.15 : 0;

  useFrame((_, delta) => {
    if (reducedMotion || !meshRef.current || !isRoot) return;
    meshRef.current.rotation.y += delta * 0.08;
  });

  const x = (node.position?.x ?? 0) * 0.02;
  const z = (node.position?.y ?? 0) * 0.02;
  const geometry =
    node.asset_type === "bus" ? "box" : node.asset_type === "motor" ? "cylinder" : "box";

  return (
    <group position={[x, 0.4, z]}>
      <mesh
        ref={meshRef}
        onClick={() => onSelect?.(node.id)}
        castShadow
        receiveShadow
      >
        {geometry === "cylinder" ? (
          <cylinderGeometry args={[0.25, 0.25, 0.6, 12]} />
        ) : (
          <boxGeometry args={[0.5, 0.5, 0.5]} />
        )}
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={intensity} />
      </mesh>
      <Html distanceFactor={12} position={[0, 0.55, 0]} center>
        <span className="map3d-label" data-tabular>
          {node.label ?? node.id}
        </span>
      </Html>
    </group>
  );
}

function PowerCable({ from, to, highlight }: { from: [number, number, number]; to: [number, number, number]; highlight: boolean }) {
  const mid: [number, number, number] = [
    (from[0] + to[0]) / 2,
    0.15,
    (from[2] + to[2]) / 2,
  ];
  return (
    <Line
      points={[from, mid, to]}
      color={highlight ? "#c9a227" : "#4a5568"}
      lineWidth={1}
    />
  );
}

function CameraFocus({
  targetId,
  nodes,
  reducedMotion,
}: {
  targetId: string | null | undefined;
  nodes: MapNode[];
  reducedMotion: boolean;
}) {
  const { camera } = useThree();
  const target = nodes.find((n) => n.id === targetId);
  useEffect(() => {
    if (!target?.position) return;
    const x = target.position.x * 0.02;
    const z = target.position.y * 0.02;
    const duration = reducedMotion ? 0 : 400;
    const start = performance.now();
    const from = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    const to = { x: x + 2, y: 2.2, z: z + 2 };
    let frame = 0;
    const tick = (now: number) => {
      const t = reducedMotion ? 1 : Math.min(1, (now - start) / duration);
      camera.position.x = from.x + (to.x - from.x) * t;
      camera.position.y = from.y + (to.y - from.y) * t;
      camera.position.z = from.z + (to.z - from.z) * t;
      camera.lookAt(x, 0.4, z);
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
        nodes
          .filter((n) => n.position)
          .map((n) => [n.id, { x: (n.position!.x) * 0.02, y: 0.4, z: (n.position!.y) * 0.02 }]),
      ),
    [nodes],
  );
  const pathSet = useMemo(() => new Set(causalPath ?? []), [causalPath]);

  return (
    <>
      <color attach="background" args={["#1a1f24"]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[4, 6, 3]} intensity={0.55} castShadow />
      <gridHelper args={[12, 24, "#2a3440", "#222a32"]} position={[0, 0, 0]} />
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
        const meshProps = {
          key: node.id,
          node,
          status: statusForAsset(node.id, assetStatus),
          isRoot: node.id === rootAssetId,
          isOnPath: pathSet.has(node.id),
          reducedMotion: !!reducedMotion,
          ...(onSelectAsset ? { onSelect: onSelectAsset } : {}),
        };
        return <AssetMesh {...meshProps} />;
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