/**
 * Steady edge overlay around a model's footprint box: corner brackets in the status colour when
 * abnormal, accent when selected, a faint floor tint on hover. Unlit (toneMapped off) so the
 * colour is exactly the design token. Never animated, never blinking.
 */
import { useMemo } from "react";
import * as THREE from "three";
import type { Footprint } from "../lib/registry";
import { Instanced, type InstanceItem } from "./parts";

const basicCache = new Map<string, THREE.MeshBasicMaterial>();
function basic(color: string, opacity = 1): THREE.MeshBasicMaterial {
  const key = `${color}:${opacity}`;
  let m = basicCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      toneMapped: false,
      depthWrite: opacity >= 1,
    });
    basicCache.set(key, m);
  }
  return m;
}

export function disposeFrameMaterials() {
  for (const m of basicCache.values()) m.dispose();
  basicCache.clear();
}

/** Corner-bracket instances for a box of size w×h×d (floor at y=0). */
export function bracketItems(fp: Footprint, pad: number, arm: number, t: number): InstanceItem[] {
  const hw = fp.w / 2 + pad;
  const hd = fp.d / 2 + pad;
  const top = fp.h + pad;
  const items: InstanceItem[] = [];
  const a = (len: number) => Math.min(arm, len * 0.3);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (const y of [t / 2, top]) {
        const sy = y === top ? -1 : 1;
        const ax = a(hw * 2);
        const az = a(hd * 2);
        const ay = a(top);
        items.push({ p: [sx * (hw - ax / 2), y, sz * hd], s: [ax, t, t] });
        items.push({ p: [sx * hw, y, sz * (hd - az / 2)], s: [t, t, az] });
        items.push({ p: [sx * hw, y + (sy * ay) / 2, sz * hd], s: [t, ay, t] });
      }
    }
  }
  return items;
}

export function StatusFrame({
  footprint,
  statusColor,
  accent,
  selected,
  hovered,
}: {
  footprint: Footprint;
  statusColor: string | null;
  accent: string;
  selected: boolean;
  hovered: boolean;
}) {
  const scale = Math.max(footprint.w, footprint.d, footprint.h);
  const t = Math.min(0.03, Math.max(0.008, scale * 0.011));
  const pad = Math.min(0.12, 0.05 + scale * 0.02);
  const arm = Math.min(0.6, Math.max(0.12, scale * 0.16));
  const items = useMemo(() => bracketItems(footprint, pad, arm, t), [footprint, pad, arm, t]);
  const bracketColor = statusColor ?? (selected ? accent : null);
  const tint = statusColor ?? (selected || hovered ? accent : null);
  const tintOpacity = statusColor ? 0.16 : selected ? 0.12 : 0.07;
  return (
    <group>
      {bracketColor ? (
        <Instanced items={items} m={basic(bracketColor)}>
          <boxGeometry args={[1, 1, 1]} />
        </Instanced>
      ) : null}
      {tint ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]} material={basic(tint, tintOpacity)} renderOrder={1}>
          <planeGeometry args={[footprint.w + pad * 2, footprint.d + pad * 2]} />
        </mesh>
      ) : null}
      {selected && statusColor ? (
        <FloorRing w={footprint.w + pad * 2 + 0.08} d={footprint.d + pad * 2 + 0.08} t={t} color={accent} />
      ) : null}
    </group>
  );
}

function FloorRing({ w, d, t, color }: { w: number; d: number; t: number; color: string }) {
  const items = useMemo<InstanceItem[]>(
    () => [
      { p: [0, t / 2, d / 2], s: [w, t, t] },
      { p: [0, t / 2, -d / 2], s: [w, t, t] },
      { p: [w / 2, t / 2, 0], s: [t, t, d] },
      { p: [-w / 2, t / 2, 0], s: [t, t, d] },
    ],
    [w, d, t],
  );
  return (
    <Instanced items={items} m={basic(color)}>
      <boxGeometry args={[1, 1, 1]} />
    </Instanced>
  );
}
