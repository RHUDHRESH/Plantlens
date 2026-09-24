/**
 * Quiet studio lighting built locally (no HDR downloads): three's RoomEnvironment prefiltered with
 * PMREMGenerator for reflections, a soft key + fill, soft contact shadows and a subtle floor grid.
 * Background, floor and grid colours come from the design tokens.
 */
import { ContactShadows, Grid } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { SceneTheme } from "../lib/theme";

export function StudioEnvironment({ theme }: { theme: SceneTheme }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.035).texture;
    scene.environment = env;
    invalidate();
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
      room.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
        }
      });
    };
  }, [gl, scene, invalidate]);

  useLayoutEffect(() => {
    scene.environmentIntensity = theme.isDark ? 0.55 : 0.85;
    scene.background = new THREE.Color(theme.background);
    invalidate();
  }, [scene, theme, invalidate]);

  return (
    <>
      <hemisphereLight args={["#ffffff", theme.isDark ? "#20242a" : "#b9b6ae", theme.isDark ? 0.35 : 0.45]} />
      <directionalLight position={[6, 10, 7]} intensity={theme.isDark ? 1.0 : 1.35} color="#fffaf2" />
      <directionalLight position={[-7, 5, -4]} intensity={theme.isDark ? 0.25 : 0.35} color="#e9f0ff" />
    </>
  );
}

export function StudioFloor({
  theme,
  size,
  center = [0, 0],
  shadowScale,
  grid = true,
}: {
  theme: SceneTheme;
  size: number;
  center?: [number, number];
  shadowScale?: [number, number];
  grid?: boolean;
}) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center[0], -0.002, center[1]]}>
        <planeGeometry args={[size * 4, size * 4]} />
        <meshBasicMaterial color={theme.background} toneMapped={false} />
      </mesh>
      {grid ? (
        <Grid
          position={[center[0], 0.0005, center[1]]}
          args={[size, size]}
          cellSize={0.5}
          cellThickness={0.6}
          cellColor={theme.grid}
          sectionSize={2.5}
          sectionThickness={1}
          sectionColor={theme.gridStrong}
          fadeDistance={size * 1.1}
          fadeStrength={1.6}
          infiniteGrid
          followCamera={false}
        />
      ) : null}
      <ContactShadows
        position={[center[0], 0.001, center[1]]}
        scale={shadowScale ?? [size, size]}
        resolution={1024}
        blur={2.2}
        far={2.5}
        opacity={theme.isDark ? 0.75 : 0.42}
        color={theme.isDark ? "#000000" : "#2a2a2e"}
      />
    </group>
  );
}
