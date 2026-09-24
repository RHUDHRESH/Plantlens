/**
 * The 3D plant: equipment models at their plant.json positions, orthogonally routed cable trays /
 * pipes, area floor zones, abnormal-status outlines + steady HTML badges, hover and selection.
 * Rendered on demand (frameloop="demand"), dpr capped at 2, resources disposed on unmount.
 * Lazy chunk — never imported by the runtime shell.
 */
import { Html } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { StatusBadge } from "../../../components/ui/primitives";
import type { AssetStatus } from "../../maps2d/mapTypes";
import type { CameraCommand } from "../lib/camera";
import { footprintRect, type PlacedAsset, type PlantLayout } from "../lib/layout";
import { statusPresentation } from "../lib/status";
import { useSceneTheme, type SceneTheme } from "../lib/theme";
import { ComponentModel, SceneThemeContext } from "../models/ComponentModel";
import { disposeMaterials } from "../models/materials";
import { Instanced, type InstanceItem } from "../models/parts";
import { disposeFrameMaterials } from "../models/StatusFrame";
import { disposeTextures } from "../models/textures";
import { CameraRig } from "./CameraRig";
import { Connections, disposeConnectionMaterials, type SceneEdge } from "./Connections";
import { StudioEnvironment, StudioFloor } from "./SceneStage";

export interface PlantSceneProps {
  layout: PlantLayout;
  edges: SceneEdge[];
  assetStatus: Record<string, AssetStatus>;
  running?: Record<string, boolean>;
  selectedId: string | null;
  command: CameraCommand | null;
  reducedMotion: boolean;
  /** Highlighted assets (e.g. a causal path) get an accent floor tint. */
  highlightIds?: string[];
  showLabels?: boolean;
  onSelect: (id: string | null) => void;
  onDistance?: (distance: number, fitDistance: number) => void;
}

const AssetNode = memo(function AssetNode({
  asset,
  status,
  running,
  selected,
  hovered,
  highlighted,
  showLabel,
  onSelect,
  onHover,
}: {
  asset: PlacedAsset;
  status: AssetStatus;
  running: boolean;
  selected: boolean;
  hovered: boolean;
  highlighted: boolean;
  showLabel: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const p = statusPresentation(status);
  const over = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      onHover(asset.id);
    },
    [asset.id, onHover],
  );
  const out = useCallback(() => onHover(null), [onHover]);
  const click = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onSelect(asset.id);
    },
    [asset.id, onSelect],
  );
  return (
    <group position={asset.position} rotation={[0, asset.yaw, 0]} onPointerOver={over} onPointerOut={out} onClick={click} name={asset.id}>
      <ComponentModel
        kind={asset.kind}
        status={status}
        selected={selected}
        hovered={hovered || highlighted}
        running={running}
        label={asset.id}
        assetId={asset.id}
        {...(asset.modelKey ? { modelKey: asset.modelKey } : {})}
      />
      {showLabel && (p.abnormal || selected) ? (
        <Html position={[0, asset.footprint.h + 0.3, 0]} center zIndexRange={[20, 0]} className="plant3d-tag" pointerEvents="none">
          <div className={`plant3d-tag__inner${selected ? " is-selected" : ""}`}>
            <span className="plant3d-tag__name">{asset.label}</span>
            {p.badge ? <StatusBadge status={p.badge} label={p.label} compact /> : null}
          </div>
        </Html>
      ) : null}
    </group>
  );
});

function AreaZones({ layout, theme }: { layout: PlantLayout; theme: SceneTheme }) {
  const items = useMemo<InstanceItem[]>(() => {
    const out: InstanceItem[] = [];
    const t = 0.03;
    for (const z of layout.areas) {
      const w = z.max[0] - z.min[0];
      const d = z.max[1] - z.min[1];
      const cx = (z.min[0] + z.max[0]) / 2;
      const cz = (z.min[1] + z.max[1]) / 2;
      out.push({ p: [cx, 0.001, z.min[1]], s: [w, 0.002, t] }, { p: [cx, 0.001, z.max[1]], s: [w, 0.002, t] });
      out.push({ p: [z.min[0], 0.001, cz], s: [t, 0.002, d] }, { p: [z.max[0], 0.001, cz], s: [t, 0.002, d] });
    }
    return out;
  }, [layout.areas]);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: theme.gridStrong, toneMapped: false }), [theme.gridStrong]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <group>
      <Instanced items={items} m={material}>
        <boxGeometry args={[1, 1, 1]} />
      </Instanced>
      {layout.areas.map((z) => (
        <Html key={z.id} position={[z.min[0] + 0.1, 0.01, z.max[1] + 0.05]} zIndexRange={[10, 0]} className="plant3d-area" pointerEvents="none">
          <span>{z.name}</span>
        </Html>
      ))}
    </group>
  );
}

function SceneContents(props: PlantSceneProps & { theme: SceneTheme }) {
  const { layout, edges, assetStatus, running, selectedId, command, reducedMotion, highlightIds, showLabels = true, onSelect, onDistance, theme } = props;
  const [hovered, setHovered] = useState<string | null>(null);
  const highlight = useMemo(() => new Set(highlightIds ?? []), [highlightIds]);
  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);

  const b = layout.bounds;
  const size = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]) + 12;
  const center: [number, number] = [(b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2];
  const select = useCallback((id: string) => onSelect(id), [onSelect]);

  return (
    <SceneThemeContext.Provider value={theme}>
      <StudioEnvironment theme={theme} />
      <StudioFloor theme={theme} size={size} center={center} shadowScale={[b.max[0] - b.min[0] + 4, b.max[2] - b.min[2] + 4]} />
      <AreaZones layout={layout} theme={theme} />
      <Connections layout={layout} edges={edges} theme={theme} activeAssetId={selectedId ?? hovered} />
      {layout.assets.map((a) => (
        <AssetNode
          key={a.id}
          asset={a}
          status={assetStatus[a.id] ?? "unknown"}
          running={!!running?.[a.id]}
          selected={a.id === selectedId}
          hovered={a.id === hovered}
          highlighted={highlight.has(a.id)}
          showLabel={showLabels}
          onSelect={select}
          onHover={setHovered}
        />
      ))}
      <CameraRig layout={layout} command={command} selectedId={selectedId} reducedMotion={reducedMotion} onDistance={onDistance} />
    </SceneThemeContext.Provider>
  );
}

export default function PlantScene(props: PlantSceneProps) {
  const theme = useSceneTheme();
  useEffect(
    () => () => {
      disposeMaterials();
      disposeTextures();
      disposeFrameMaterials();
      disposeConnectionMaterials();
    },
    [],
  );
  const hasFootprints = props.layout.assets.every((a) => footprintRect(a).hw > 0);
  return (
    <Canvas
      className="plant3d-canvas"
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ fov: 32, near: 0.05, far: 500, position: [12, 9, 14] }}
      gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping, powerPreference: "high-performance" }}
      onPointerMissed={() => props.onSelect(null)}
      aria-label="3D plant view"
    >
      {hasFootprints ? <SceneContents {...props} theme={theme} /> : null}
    </Canvas>
  );
}
