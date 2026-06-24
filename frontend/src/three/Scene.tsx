/**
 * 3D scene — R3F operational map canvas (Screen 01).
 * Calm neutral industrial map with Motor / Fan / Blower demo topology.
 */
import { Canvas } from "@react-three/fiber";
import { AssetMesh } from "./AssetMesh";
import { CameraRig } from "./CameraRig";
import { DEMO_ASSETS } from "../data/demoPlant";
import { colors } from "../design/tokens";

function ProcessLine() {
  const points: [number, number, number][] = [
    [-3, 0.1, 0],
    [0, 0.1, 0],
    [3, 0.1, 0],
  ];
  return (
    <group>
      {points.slice(0, -1).map((start, i) => {
        const end = points[i + 1]!;
        const mid: [number, number, number] = [
          (start[0] + end[0]) / 2,
          0.1,
          (start[2] + end[2]) / 2,
        ];
        const len = Math.sqrt(
          (end[0] - start[0]) ** 2 + (end[2] - start[2]) ** 2,
        );
        const angle = Math.atan2(end[2] - start[2], end[0] - start[0]);
        return (
          <mesh key={i} position={mid} rotation={[0, -angle, Math.PI / 2]}>
            <cylinderGeometry args={[0.04, 0.04, len, 8]} />
            <meshStandardMaterial color="#a8a29e" />
          </mesh>
        );
      })}
    </group>
  );
}

export function Scene() {
  return (
    <Canvas
      camera={{ position: [0, 5, 10], fov: 45 }}
      style={{ background: colors.bgMap }}
    >
      <color attach="background" args={[colors.bgMap]} />
      <fog attach="fog" args={[colors.bgMapAlt, 18, 42]} />
      <ambientLight intensity={0.85} />
      <directionalLight position={[8, 12, 6]} intensity={0.65} castShadow />
      <CameraRig />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[24, 24]} />
        <meshStandardMaterial color={colors.bgMap} />
      </mesh>
      <gridHelper args={[24, 24, "#c4c0b8", "#d8d4cc"]} position={[0, 0.01, 0]} />
      <ProcessLine />
      {DEMO_ASSETS.map((asset) => (
        <AssetMesh
          key={asset.id}
          id={asset.id}
          label={asset.label}
          typeId={asset.typeId}
          position={asset.position}
          state={asset.state}
        />
      ))}
    </Canvas>
  );
}