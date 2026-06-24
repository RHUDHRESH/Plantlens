/**
 * AssetMesh — procedural asset primitive with color-as-language.
 * Click selects asset and opens inspector. Selected asset gets subtle pulse ring.
 */
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import { useStore } from "../store/useStore";
import { colorForState, type AssetState } from "./ColorLanguage";

interface Props {
  id: string;
  label: string;
  typeId: string;
  position: [number, number, number];
  state: AssetState;
}

export function AssetMesh({ id, label, typeId, position, state }: Props) {
  const ref = useRef<Mesh>(null);
  const ringRef = useRef<Mesh>(null);
  const selectedAssetId = useStore((s) => s.selectedAssetId);
  const setSelectedAsset = useStore((s) => s.setSelectedAsset);
  const selected = selectedAssetId === id;
  const color = colorForState(state);

  useFrame(({ clock }) => {
    if (ringRef.current && selected) {
      const pulse = 1 + Math.sin(clock.elapsedTime * 2) * 0.04;
      ringRef.current.scale.setScalar(pulse);
    }
  });

  const handleClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setSelectedAsset(id);
  };

  const geometry =
    typeId === "centrifugal_fan" ? (
      <cylinderGeometry args={[0.7, 0.7, 0.25, 32]} />
    ) : typeId === "positive_displacement_blower" ? (
      <boxGeometry args={[1.2, 0.8, 0.8]} />
    ) : (
      <cylinderGeometry args={[0.5, 0.5, 1.2, 24]} />
    );

  return (
    <group position={position} onClick={handleClick}>
      <mesh ref={ref} castShadow>
        {geometry}
        <meshStandardMaterial color={color} />
      </mesh>

      {typeId === "induction_motor_3ph" && (
        <mesh position={[0, 0, 0.8]}>
          <cylinderGeometry args={[0.12, 0.12, 0.6, 16]} />
          <meshStandardMaterial color="#9ca3af" />
        </mesh>
      )}

      {selected && (
        <mesh ref={ringRef} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.85, 1.05, 48]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.55} />
        </mesh>
      )}

      {/* Invisible hit target for easier selection */}
      <mesh visible={false}>
        <boxGeometry args={[2, 1.5, 2]} />
        <meshBasicMaterial />
      </mesh>

      <group position={[0, 1.2, 0]}>
        {/* Label anchor — HTML labels deferred to future pass */}
        <mesh visible={false} userData={{ label, assetId: id }} />
      </group>
    </group>
  );
}