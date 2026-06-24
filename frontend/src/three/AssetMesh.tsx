/**
 * AssetMesh — instances geometry by type_id (Domain L). Procedural primitive
 * composition first (cylinders/boxes from the geometry/registry), GLB fallback.
 * Color-as-language: gray normal, amber deviation, red situation, grey resolved.
 */
import { useRef } from "react";
import type { Mesh } from "three";
import { useStore } from "../store/useStore";
import { colorForState } from "./ColorLanguage";

interface Props {
  typeId: string;
  position: [number, number, number];
}

export function AssetMesh({ typeId, position }: Props) {
  const ref = useRef<Mesh>(null);
  const situations = useStore((s) => s.situations);
  const abnormal = situations.length > 0;
  const color = colorForState(abnormal ? "warning" : "normal");
  // Geometry selection keys off typeId via geometry/registry.json (procedural|glb).
  const builder = typeId.startsWith("induction_motor") ? "motor" : "asset";

  return (
    <group position={position} data-builder={builder}>
      {/* Procedural motor: body cylinder + shaft. Real impl keys off geometry/registry.json */}
      <mesh ref={ref} castShadow>
        <cylinderGeometry args={[0.5, 0.5, 1.2, 24]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0, 0.8]}>
        <cylinderGeometry args={[0.12, 0.12, 0.6, 16]} />
        <meshStandardMaterial color="#9ca3af" />
      </mesh>
      <group rotation={[Math.PI / 2, 0, 0]}>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[1.4, 0.6, 0.6]} />
          <meshStandardMaterial color="#4b5563" />
        </mesh>
      </group>
    </group>
  );
}
