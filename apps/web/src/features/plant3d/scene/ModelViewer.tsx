/**
 * Single-model viewer ("turntable"). Used by /ops/3d?model=<kind> for model review and reusable
 * by any page that wants to show one piece of equipment. Optional slow spin (off with reduced
 * motion).
 */
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { footprintFor, type ModelKind } from "../lib/registry";
import { useSceneTheme } from "../lib/theme";
import { ComponentModel, SceneThemeContext } from "../models/ComponentModel";
import { disposeMaterials } from "../models/materials";
import { disposeFrameMaterials } from "../models/StatusFrame";
import { disposeTextures } from "../models/textures";
import { StudioEnvironment, StudioFloor } from "./SceneStage";

export type ViewerAngle = "iso" | "front" | "side" | "back" | "top" | "rear";

const DIRS: Record<ViewerAngle, [number, number, number]> = {
  iso: [1, 0.62, 1.15],
  front: [0, 0.25, 1],
  side: [1, 0.25, 0],
  back: [-1, 0.6, -1.1],
  rear: [-1.1, 0.5, 0.9],
  top: [0.001, 1, 0.02],
};

export interface ModelViewerProps {
  kind: ModelKind;
  status?: string;
  selected?: boolean;
  running?: boolean;
  label?: string;
  angle?: ViewerAngle;
  spin?: boolean;
  zoom?: number;
}

export default function ModelViewer({ kind, status = "normal", selected = false, running = true, label, angle = "iso", spin = false, zoom = 1 }: ModelViewerProps) {
  const theme = useSceneTheme();
  const fp = footprintFor(kind);
  const { position, target } = useMemo(() => {
    const maxDim = Math.max(fp.w, fp.d, fp.h);
    const dist = (maxDim * 1.95 + 0.45) / zoom;
    const dir = new THREE.Vector3(...DIRS[angle]).normalize().multiplyScalar(dist);
    const t = new THREE.Vector3(0, fp.h * 0.42, 0);
    return { position: dir.add(t).toArray() as [number, number, number], target: t.toArray() as [number, number, number] };
  }, [fp.w, fp.d, fp.h, angle, zoom]);

  useEffect(
    () => () => {
      disposeMaterials();
      disposeTextures();
      disposeFrameMaterials();
    },
    [],
  );

  const size = Math.max(fp.w, fp.d) * 4 + 2;
  return (
    <Canvas
      className="plant3d-canvas"
      dpr={[1, 2]}
      camera={{ position, fov: 35, near: 0.02, far: 200 }}
      gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping, preserveDrawingBuffer: true }}
      frameloop={spin ? "always" : "demand"}
      data-testid="plant3d-model-viewer"
    >
      <SceneThemeContext.Provider value={theme}>
        <StudioEnvironment theme={theme} />
        <StudioFloor theme={theme} size={size} shadowScale={[Math.max(fp.w, fp.d) * 2 + 1, Math.max(fp.w, fp.d) * 2 + 1]} />
        <ComponentModel kind={kind} status={status} selected={selected} running={running} {...(label ? { label } : {})} />
        <OrbitControls makeDefault target={target} enableDamping autoRotate={spin} autoRotateSpeed={0.6} maxPolarAngle={Math.PI / 2 - 0.05} />
      </SceneThemeContext.Provider>
    </Canvas>
  );
}
