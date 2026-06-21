/**
 * Low-poly schematic 3D components — procedural geometry only, lazy-loaded chunk.
 * Performance: ~8 nodes, no postprocessing; target <5ms/frame on integrated GPU.
 */
import { useRef, type ReactNode } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import type { AssetStatus } from "../maps2d/mapTypes";
import type { Map3DNode } from "../ops3d/map3dTypes";
import { resolveIconKey } from "../maps2d/iconRegistry";

/* Deep base colors — the mesh body tint */
const STATUS_COLOR: Record<AssetStatus, string> = {
  normal: "#0a3030",
  warning: "#4a2800",
  critical: "#3d0000",
  sensor_bad: "#1e1060",
  offline: "#18181b",
  unknown: "#18181b",
};

/* Emissive glow — what you SEE in sci-fi dark lighting */
const STATUS_EMISSIVE: Record<AssetStatus, string> = {
  normal: "#00d68f",
  warning: "#f59e0b",
  critical: "#ef4444",
  sensor_bad: "#8b5cf6",
  offline: "#000000",
  unknown: "#000000",
};

const STATUS_EMISSIVE_INTENSITY: Record<AssetStatus, number> = {
  normal: 0.28,
  warning: 0.55,
  critical: 0.72,
  sensor_bad: 0.45,
  offline: 0,
  unknown: 0,
};

function statusColor(status: AssetStatus): string {
  return STATUS_COLOR[status];
}

function statusEmissive(status: AssetStatus): string {
  return STATUS_EMISSIVE[status];
}

function statusEmissiveIntensity(status: AssetStatus): number {
  return STATUS_EMISSIVE_INTENSITY[status];
}

function MeshBody({
  color,
  emissive,
  intensity,
  onSelect,
  children,
}: {
  color: string;
  emissive: string;
  intensity: number;
  onSelect?: () => void;
  children: ReactNode;
}) {
  const clickProps = onSelect ? { onClick: onSelect } : {};
  return (
    <mesh {...clickProps} castShadow receiveShadow>
      {children}
      <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={intensity} />
    </mesh>
  );
}

function optionalClick(onSelect?: () => void) {
  return onSelect ? { onSelect } : {};
}

function SolarArrayMesh({ color, emissive, intensity, onSelect }: { color: string; emissive: string; intensity: number; onSelect?: () => void }) {
  return (
    <group rotation={[-0.35, 0.2, 0]}>
      <MeshBody color={color} emissive={emissive} intensity={intensity} {...optionalClick(onSelect)}>
        <boxGeometry args={[0.55, 0.04, 0.35]} />
      </MeshBody>
      <mesh position={[0, -0.06, 0]}>
        <boxGeometry args={[0.5, 0.02, 0.3]} />
        <meshStandardMaterial color="#2a3440" />
      </mesh>
    </group>
  );
}

function ChargeControllerMesh({ color, emissive, intensity, onSelect }: { color: string; emissive: string; intensity: number; onSelect?: () => void }) {
  return (
    <group>
      <MeshBody color={color} emissive={emissive} intensity={intensity} {...optionalClick(onSelect)}>
        <boxGeometry args={[0.35, 0.25, 0.2]} />
      </MeshBody>
      <mesh position={[0.12, 0, 0.11]}>
        <boxGeometry args={[0.08, 0.1, 0.01]} />
        <meshStandardMaterial color="#1a1f24" />
      </mesh>
    </group>
  );
}

function BatteryMesh({ color, emissive, intensity, onSelect }: { color: string; emissive: string; intensity: number; onSelect?: () => void }) {
  const clickProps = onSelect ? { onClick: onSelect } : {};
  return (
    <group>
      {[0, 0.12, 0.24].map((y) => (
        <mesh key={y} position={[0, y, 0]} {...clickProps} castShadow>
          <boxGeometry args={[0.3, 0.1, 0.2]} />
          <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={intensity} />
        </mesh>
      ))}
    </group>
  );
}

function DcBusMesh({ color, emissive, intensity, onSelect }: { color: string; emissive: string; intensity: number; onSelect?: () => void }) {
  return (
    <MeshBody color={color} emissive={emissive} intensity={intensity} {...optionalClick(onSelect)}>
      <boxGeometry args={[0.7, 0.06, 0.08]} />
    </MeshBody>
  );
}

function InverterMesh({ color, emissive, intensity, onSelect }: { color: string; emissive: string; intensity: number; onSelect?: () => void }) {
  return (
    <group>
      <MeshBody color={color} emissive={emissive} intensity={intensity} {...optionalClick(onSelect)}>
        <boxGeometry args={[0.38, 0.45, 0.28]} />
      </MeshBody>
      {[0.12, 0, -0.12].map((z) => (
        <mesh key={z} position={[0, 0.1, z]}>
          <boxGeometry args={[0.3, 0.02, 0.02]} />
          <meshStandardMaterial color="#1a1f24" />
        </mesh>
      ))}
    </group>
  );
}

function MotorMesh({
  color,
  emissive,
  intensity,
  onSelect,
  spin,
}: {
  color: string;
  emissive: string;
  intensity: number;
  onSelect?: () => void;
  spin: boolean;
}) {
  const bodyRef = useRef<Mesh>(null);
  const clickProps = onSelect ? { onClick: onSelect } : {};
  useFrame((_, delta) => {
    if (spin && bodyRef.current) bodyRef.current.rotation.y += delta * 0.5;
  });
  return (
    <group>
      <mesh ref={bodyRef} {...clickProps} castShadow position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.18, 0.18, 0.35, 12]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={intensity} />
      </mesh>
      <mesh position={[0.28, 0.15, 0]} rotation={[0, 0, Math.PI / 2]} {...clickProps}>
        <cylinderGeometry args={[0.04, 0.04, 0.2, 8]} />
        <meshStandardMaterial color="#4a5568" />
      </mesh>
      <mesh position={[0, -0.05, 0]} {...clickProps}>
        <boxGeometry args={[0.4, 0.08, 0.3]} />
        <meshStandardMaterial color="#2a3440" />
      </mesh>
    </group>
  );
}

function LampMesh({ color, emissive, intensity, onSelect }: { color: string; emissive: string; intensity: number; onSelect?: () => void }) {
  return (
    <group>
      <MeshBody color={color} emissive={emissive} intensity={intensity} {...optionalClick(onSelect)}>
        <boxGeometry args={[0.15, 0.2, 0.15]} />
      </MeshBody>
      <mesh position={[0, -0.14, 0]} {...(onSelect ? { onClick: onSelect } : {})}>
        <boxGeometry args={[0.08, 0.06, 0.08]} />
        <meshStandardMaterial color="#4a5568" />
      </mesh>
    </group>
  );
}

function BreakerMesh({ color, emissive, intensity, onSelect }: { color: string; emissive: string; intensity: number; onSelect?: () => void }) {
  return (
    <MeshBody color={color} emissive={emissive} intensity={intensity} {...optionalClick(onSelect)}>
      <boxGeometry args={[0.12, 0.22, 0.14]} />
    </MeshBody>
  );
}

function GenericMesh({ color, emissive, intensity, onSelect }: { color: string; emissive: string; intensity: number; onSelect?: () => void }) {
  return (
    <MeshBody color={color} emissive={emissive} intensity={intensity} {...optionalClick(onSelect)}>
      <boxGeometry args={[0.4, 0.4, 0.4]} />
    </MeshBody>
  );
}

export function SchematicAssetMesh({
  node,
  status,
  isRoot,
  isOnPath,
  reducedMotion,
  pathStep,
  onSelect,
}: {
  node: Map3DNode;
  status: AssetStatus;
  isRoot: boolean;
  isOnPath: boolean;
  reducedMotion: boolean;
  pathStep?: number;
  onSelect?: (id: string) => void;
}) {
  const color = statusColor(status);
  const baseEmissive = statusEmissive(status);
  const baseIntensity = statusEmissiveIntensity(status);
  /* Root/path boost on top of status glow */
  const emissive = isRoot ? "#ef4444" : isOnPath ? "#f59e0b" : baseEmissive;
  const intensity = isRoot
    ? Math.max(baseIntensity, 0.75)
    : isOnPath
      ? Math.max(baseIntensity, 0.45)
      : baseIntensity;
  const iconKey = resolveIconKey(node.asset_type);
  const click = onSelect ? () => onSelect(node.id) : undefined;
  const meshProps = {
    color,
    emissive,
    intensity,
    ...(click ? { onSelect: click } : {}),
  };

  const x = node.position.x;
  const y = node.position.y;
  const z = node.position.z;

  let body: ReactNode;
  switch (iconKey) {
    case "solar":
      body = <SolarArrayMesh {...meshProps} />;
      break;
    case "charge_controller":
      body = <ChargeControllerMesh {...meshProps} />;
      break;
    case "battery":
      body = <BatteryMesh {...meshProps} />;
      break;
    case "dc_bus":
      body = <DcBusMesh {...meshProps} />;
      break;
    case "inverter":
      body = <InverterMesh {...meshProps} />;
      break;
    case "motor":
      body = <MotorMesh {...meshProps} spin={isRoot && !reducedMotion} />;
      break;
    case "lamp":
      body = <LampMesh {...meshProps} />;
      break;
    case "breaker":
      body = <BreakerMesh {...meshProps} />;
      break;
    default:
      body = <GenericMesh {...meshProps} />;
  }

  return (
    <group position={[x, y, z]}>
      {body}
      <Html distanceFactor={12} position={[0, 0.55, 0]} center>
        <span className="map3d-label" data-tabular>
          {node.label ?? node.id}
          {pathStep !== undefined ? ` · ${pathStep}` : ""}
        </span>
      </Html>
    </group>
  );
}