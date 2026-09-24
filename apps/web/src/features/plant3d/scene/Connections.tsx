/**
 * Physical connections between assets, routed orthogonally: power runs as cable in a galvanised
 * floor tray, signal as thin conduit, process/cooling as pipe on supports. Cable jackets carry a
 * muted tint of the medium token; a connection of the selected asset is drawn in the accent.
 */
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { footprintRect, type PlantLayout, type Vec3 } from "../lib/layout";
import { buildOrthogonalRoute, filletPolyline, mediumForEdgeType, routeHeightFor, type EdgeMedium } from "../lib/routing";
import type { SceneTheme } from "../lib/theme";
import { Instanced, type InstanceItem } from "../models/parts";

export interface SceneEdge {
  id: string;
  from: string;
  to: string;
  type: string;
}

interface Route {
  id: string;
  medium: EdgeMedium;
  points: Vec3[];
  base: Vec3[];
  touches: [string, string];
}

const TRAY_W = 0.2;

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function cableMaterial(color: string, emissive = false, metal = 0) {
  const key = `${color}:${emissive}:${metal}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: metal ? 0.45 : 0.62, metalness: metal, emissive: emissive ? color : "#000000", emissiveIntensity: emissive ? 0.35 : 0 });
    matCache.set(key, m);
  }
  return m;
}

export function disposeConnectionMaterials() {
  for (const m of matCache.values()) m.dispose();
  matCache.clear();
}

function mix(a: string, b: string, t: number): string {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
}

export function computeRoutes(layout: PlantLayout, edges: SceneEdge[]): Route[] {
  const byId = new Map(layout.assets.map((a) => [a.id, a]));
  const fanOut = new Map<string, number>();
  const counters = new Map<string, number>();
  for (const e of edges) fanOut.set(e.from, (fanOut.get(e.from) ?? 0) + 1);
  const out: Route[] = [];
  for (const e of edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const medium = mediumForEdgeType(e.type);
    if (medium === "causal") continue; // logical, not physical
    const ra = footprintRect(a);
    const rb = footprintRect(b);
    const endA = { center: [a.position[0], a.position[2]] as [number, number], half: [ra.hw, ra.hd] as [number, number] };
    const endB = { center: [b.position[0], b.position[2]] as [number, number], half: [rb.hw, rb.hd] as [number, number] };
    const n = fanOut.get(e.from) ?? 1;
    const k = counters.get(e.from) ?? 0;
    counters.set(e.from, k + 1);
    const lane = n > 1 ? (k - (n - 1) / 2) * 0.05 : 0;
    const h = routeHeightFor(medium);
    out.push({
      id: e.id,
      medium,
      points: buildOrthogonalRoute(endA, endB, h, lane),
      base: buildOrthogonalRoute(endA, endB, h, 0),
      touches: [e.from, e.to],
    });
  }
  return out;
}

function segmentBoxes(routes: Route[]) {
  const seen = new Set<string>();
  const bottoms: InstanceItem[] = [];
  const lips: InstanceItem[] = [];
  for (const r of routes) {
    if (r.medium !== "power") continue;
    for (let i = 1; i < r.base.length; i++) {
      const a = r.base[i - 1]!;
      const b = r.base[i]!;
      const key = [a, b].map((p) => p.map((v) => v.toFixed(2)).join(",")).sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const alongX = Math.abs(b[0] - a[0]) > Math.abs(b[2] - a[2]);
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]) + TRAY_W;
      const cx = (a[0] + b[0]) / 2;
      const cz = (a[2] + b[2]) / 2;
      bottoms.push({ p: [cx, 0.022, cz], s: alongX ? [len, 0.006, TRAY_W] : [TRAY_W, 0.006, len] });
      for (const s of [-1, 1]) {
        lips.push({
          p: alongX ? [cx, 0.045, cz + (s * TRAY_W) / 2] : [cx + (s * TRAY_W) / 2, 0.045, cz],
          s: alongX ? [len, 0.05, 0.006] : [0.006, 0.05, len],
        });
      }
      // floor supports every ~1.2 m
      const count = Math.max(2, Math.round(len / 1.2));
      for (let k = 0; k <= count; k++) {
        const t = k / count;
        const x = alongX ? a[0] + (b[0] - a[0]) * t : cx;
        const z = alongX ? cz : a[2] + (b[2] - a[2]) * t;
        bottoms.push({ p: [x, 0.01, z], s: alongX ? [0.04, 0.02, TRAY_W + 0.06] : [TRAY_W + 0.06, 0.02, 0.04] });
      }
    }
  }
  return { bottoms, lips };
}

function RouteTube({ points, radius, material }: { points: Vec3[]; radius: number; material: THREE.Material }) {
  const geometry = useMemo(() => {
    const smooth = filletPolyline(points, Math.max(0.12, radius * 5), 6);
    const path = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 1; i < smooth.length; i++) path.add(new THREE.LineCurve3(new THREE.Vector3(...smooth[i - 1]!), new THREE.Vector3(...smooth[i]!)));
    return new THREE.TubeGeometry(path, Math.max(8, smooth.length * 4), radius, 10, false);
  }, [points, radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={material} />;
}

function PipeSupports({ routes }: { routes: Route[] }) {
  const items = useMemo<InstanceItem[]>(() => {
    const out: InstanceItem[] = [];
    for (const r of routes) {
      if (r.medium !== "fluid") continue;
      for (let i = 1; i < r.points.length; i++) {
        const a = r.points[i - 1]!;
        const b = r.points[i]!;
        const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
        const n = Math.floor(len / 1.5);
        for (let k = 1; k <= n; k++) {
          const t = k / (n + 1);
          out.push({ p: [a[0] + (b[0] - a[0]) * t, a[1] / 2, a[2] + (b[2] - a[2]) * t], s: [0.05, a[1], 0.05] });
        }
      }
    }
    return out;
  }, [routes]);
  return (
    <Instanced items={items} m="galvanised">
      <boxGeometry args={[1, 1, 1]} />
    </Instanced>
  );
}

export function Connections({
  layout,
  edges,
  theme,
  activeAssetId,
}: {
  layout: PlantLayout;
  edges: SceneEdge[];
  theme: SceneTheme;
  activeAssetId: string | null;
}) {
  const routes = useMemo(() => computeRoutes(layout, edges), [layout, edges]);
  const trays = useMemo(() => segmentBoxes(routes), [routes]);
  const jacketBase = theme.isDark ? "#2a2c2f" : "#2c2e31";
  return (
    <group>
      <Instanced items={trays.bottoms} m="galvanised">
        <boxGeometry args={[1, 1, 1]} />
      </Instanced>
      <Instanced items={trays.lips} m="galvanised">
        <boxGeometry args={[1, 1, 1]} />
      </Instanced>
      <PipeSupports routes={routes} />
      {routes.map((r) => {
        const active = !!activeAssetId && r.touches.includes(activeAssetId);
        const medium = theme.medium[r.medium];
        if (r.medium === "fluid") {
          return <RouteTube key={r.id} points={r.points} radius={0.05} material={cableMaterial(active ? theme.accent : mix("#8E9398", medium, 0.35), active, 0.3)} />;
        }
        if (r.medium === "signal") {
          return <RouteTube key={r.id} points={r.points} radius={0.012} material={cableMaterial(active ? theme.accent : mix("#9A9EA2", medium, 0.25), active, 0.6)} />;
        }
        return <RouteTube key={r.id} points={r.points} radius={0.018} material={cableMaterial(active ? theme.accent : mix(jacketBase, medium, 0.28), active)} />;
      })}
    </group>
  );
}
