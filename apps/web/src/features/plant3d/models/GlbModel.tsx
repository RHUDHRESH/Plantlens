/**
 * Imported manufacturer model (GLB). Loaded with drei useGLTF — Draco only from a self-hosted
 * decoder (never the gstatic CDN), meshopt decoder is bundled. Normalised into the declared
 * footprint: uniform scale, centred on X/Z, lowest point on the floor.
 */
import { useGLTF } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { computeNormalisation, modelsBaseUrl, type GlbEntry } from "../lib/glbManifest";
import type { Footprint } from "../lib/registry";

export default function GlbModel({ url, entry, footprint }: { url: string; entry: GlbEntry; footprint: Footprint }) {
  const gltf = useGLTF(url, entry.draco ? `${modelsBaseUrl()}draco/` : false, true);
  const { object, scale, offset } = useMemo(() => {
    const root = gltf.scene.clone(true);
    if (entry.yaw) root.rotation.y = (entry.yaw * Math.PI) / 180;
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const fp = entry.footprint ? { w: entry.footprint[0], d: entry.footprint[1], h: entry.footprint[2] } : footprint;
    const n = computeNormalisation(box, fp);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    });
    return { object: root, scale: n.scale, offset: n.offset };
  }, [gltf, entry, footprint]);
  return (
    <group position={offset} scale={scale}>
      <primitive object={object} />
    </group>
  );
}
