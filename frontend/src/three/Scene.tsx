/**
 * 3D scene — R3F (Domain L). Three zoom levels Macro/Meso/Micro mapped to the
 * ISA-101 display hierarchy (L1 Overview -> L2 Unit -> L3 Detail -> L4 Diagnostic).
 * Color-as-language: gray normal, color = abnormal only. Instance geometry by
 * type_id (drei instancing) to keep the Pi GPU happy.
 */
import { Canvas } from "@react-three/fiber";
import { AssetMesh } from "./AssetMesh";
import { CameraRig } from "./CameraRig";

export function Scene() {
  return (
    <Canvas camera={{ position: [6, 6, 6], fov: 50 }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 7]} intensity={0.8} />
      <CameraRig />
      <AssetMesh typeId="induction_motor_3ph" position={[0, 0, 0]} />
      <gridHelper args={[20, 20]} />
    </Canvas>
  );
}
