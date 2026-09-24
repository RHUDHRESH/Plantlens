/**
 * Small reusable building blocks for the parametric component models. All dimensions in metres,
 * Y-up. Cylinders can be aligned to any axis. Repeated details (fins, bolts, cells, rollers) go
 * through <Instanced> so a model stays at a handful of draw calls.
 */
import { RoundedBox } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef, type DependencyList, type ReactNode } from "react";
import * as THREE from "three";
import { mat, type MaterialName } from "./materials";

export type V3 = [number, number, number];
export type Axis = "x" | "y" | "z";
export type Mat = MaterialName | THREE.Material;

const O: V3 = [0, 0, 0];

export function M(m: Mat): THREE.Material {
  return typeof m === "string" ? mat(m) : m;
}

export function axisRotation(axis: Axis): V3 {
  if (axis === "x") return [0, 0, -Math.PI / 2];
  if (axis === "z") return [Math.PI / 2, 0, 0];
  return [0, 0, 0];
}

export function Box({ size, position = O, rotation = O, m }: { size: V3; position?: V3; rotation?: V3; m: Mat }) {
  return (
    <mesh position={position} rotation={rotation} material={M(m)}>
      <boxGeometry args={size} />
    </mesh>
  );
}

/** Bevelled box (drei RoundedBox) — sheet-metal enclosures, castings, covers. */
export function RBox({
  size,
  radius = 0.01,
  position = O,
  rotation = O,
  m,
  smoothness = 3,
}: {
  size: V3;
  radius?: number;
  position?: V3;
  rotation?: V3;
  m: Mat;
  smoothness?: number;
}) {
  const r = Math.min(radius, Math.min(...size) / 2 - 1e-4);
  return (
    <RoundedBox args={size} radius={Math.max(r, 0.0005)} smoothness={smoothness} position={position} rotation={rotation} material={M(m)} />
  );
}

export function Cyl({
  r,
  r2,
  h,
  axis = "y",
  position = O,
  rotation,
  m,
  seg = 32,
  open = false,
  thetaStart,
  thetaLength,
}: {
  r: number;
  r2?: number;
  h: number;
  axis?: Axis;
  position?: V3;
  rotation?: V3;
  m: Mat;
  seg?: number;
  open?: boolean;
  thetaStart?: number;
  thetaLength?: number;
}) {
  const rot = rotation ?? axisRotation(axis);
  return (
    <mesh position={position} rotation={rot} material={M(m)}>
      <cylinderGeometry args={[r2 ?? r, r, h, seg, 1, open, thetaStart ?? 0, thetaLength ?? Math.PI * 2]} />
    </mesh>
  );
}

/** Surface of revolution around the local Y axis from a [radius, y] profile. */
export function Lathe({
  profile,
  seg = 48,
  axis = "y",
  position = O,
  rotation,
  m,
}: {
  profile: Array<[number, number]>;
  seg?: number;
  axis?: Axis;
  position?: V3;
  rotation?: V3;
  m: Mat;
}) {
  const points = useMemo(() => profile.map(([x, y]) => new THREE.Vector2(Math.max(x, 0), y)), [profile]);
  return (
    <mesh position={position} rotation={rotation ?? axisRotation(axis)} material={M(m)}>
      <latheGeometry args={[points, seg]} />
    </mesh>
  );
}

export interface InstanceItem {
  p: V3;
  r?: V3;
  s?: V3;
}

/** One InstancedMesh for N transforms; the geometry is the JSX child. */
export function Instanced({ items, m, children }: { items: InstanceItem[]; m: Mat; children: ReactNode }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new THREE.Object3D();
    items.forEach((it, i) => {
      o.position.set(...it.p);
      o.rotation.set(...(it.r ?? [0, 0, 0]));
      o.scale.set(...(it.s ?? [1, 1, 1]));
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
  }, [items]);
  if (!items.length) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} material={M(m)}>
      {children}
    </instancedMesh>
  );
}

/** Points on a circle in the plane perpendicular to `axis`, offset along the axis by `at`. */
export function circlePoints(axis: Axis, radius: number, count: number, at = 0, phase = 0): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < count; i++) {
    const a = phase + (i / count) * Math.PI * 2;
    const c = Math.cos(a) * radius;
    const s = Math.sin(a) * radius;
    out.push(axis === "x" ? [at, c, s] : axis === "y" ? [c, at, s] : [c, s, at]);
  }
  return out;
}

/** Pipe flange (weld-neck look): disc + raised face + through-studs with hex nuts both sides. */
export function Flange({
  r,
  t = 0.02,
  axis = "y",
  position = [0, 0, 0],
  bolts,
  m = "paintCasting",
  face = 1,
}: {
  r: number;
  t?: number;
  axis?: Axis;
  position?: V3;
  bolts?: number;
  m?: Mat;
  /** +1 / -1 — which side the raised face points to along the axis */
  face?: 1 | -1;
}) {
  const n = bolts ?? (r < 0.06 ? 4 : r < 0.11 ? 8 : 12);
  const pcd = r * 0.8;
  const nutR = Math.max(0.006, r * 0.085);
  const nutH = nutR * 0.9;
  const items = useMemo(() => {
    const list: InstanceItem[] = [];
    for (const side of [-1, 1]) {
      for (const p of circlePoints(axis, pcd, n, side * (t / 2 + nutH / 2), Math.PI / n)) list.push({ p, r: axisRotation(axis) });
    }
    return list;
  }, [axis, pcd, n, t, nutH]);
  const fo = (t / 2 + 0.002) * face;
  const facePos: V3 = axis === "x" ? [fo, 0, 0] : axis === "y" ? [0, fo, 0] : [0, 0, fo];
  return (
    <group position={position}>
      <Cyl r={r} h={t} axis={axis} m={m} seg={40} />
      <Cyl r={r * 0.6} h={0.004} axis={axis} position={facePos} m={m} seg={32} />
      <Instanced items={items} m="darkSteel">
        <cylinderGeometry args={[nutR, nutR, nutH, 6]} />
      </Instanced>
    </group>
  );
}

/** Cable gland: hex body + dome nut + short black cable tail. Points along +axis. */
export function Gland({ position, axis = "y", r = 0.011, tail = 0.05, flip = false }: { position: V3; axis?: Axis; r?: number; tail?: number; flip?: boolean }) {
  const s = flip ? -1 : 1;
  const along = (d: number): V3 => (axis === "x" ? [d * s, 0, 0] : axis === "y" ? [0, d * s, 0] : [0, 0, d * s]);
  return (
    <group position={position}>
      <Cyl r={r * 1.25} h={r * 0.8} axis={axis} position={along(r * 0.4)} m="plasticDark" seg={6} />
      <Cyl r={r} r2={r * 0.8} h={r * 1.2} axis={axis} position={along(r * 1.4)} m="plasticDark" seg={20} />
      <Cyl r={r * 0.55} h={tail} axis={axis} position={along(r * 2 + tail / 2)} m="rubber" seg={12} />
    </group>
  );
}

/** Flat textured plate (nameplates, displays, labels). Faces +Z by default. */
export function Plate({ size, position, rotation = O, material }: { size: [number, number]; position: V3; rotation?: V3; material: THREE.Material }) {
  return (
    <mesh position={position} rotation={rotation} material={material}>
      <planeGeometry args={size} />
    </mesh>
  );
}

/** Straight pipe between two points (any direction). */
export function Pipe({ from, to, r, m = "paintSilver", seg = 20 }: { from: V3; to: V3; r: number; m?: Mat; seg?: number }) {
  const { position, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = b.clone().sub(a);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    return { position: a.add(b).multiplyScalar(0.5), quaternion: q, length: dir.length() };
  }, [from, to]);
  return (
    <mesh position={position} quaternion={quaternion} material={M(m)}>
      <cylinderGeometry args={[r, r, length, seg]} />
    </mesh>
  );
}

/** Hex bolt heads at the given points, oriented along `axis`. */
export function BoltHeads({ points, axis = "y", r = 0.006, m = "darkSteel" }: { points: V3[]; axis?: Axis; r?: number; m?: Mat }) {
  const items = useMemo(() => points.map((p) => ({ p, r: axisRotation(axis) })), [points, axis]);
  return (
    <Instanced items={items} m={m}>
      <cylinderGeometry args={[r, r, r * 0.8, 6]} />
    </Instanced>
  );
}

/** useMemo for a hand-built BufferGeometry that is disposed when deps change or on unmount. */
export function useGeometry<T extends THREE.BufferGeometry>(factory: () => T, deps: DependencyList): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const geometry = useMemo(factory, deps);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}
