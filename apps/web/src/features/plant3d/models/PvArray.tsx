/**
 * Ground-mounted PV table: 2 × 3 portrait mono-crystalline modules (1722 × 1134 × 35 mm) on
 * aluminium rails, galvanised rafters and posts on concrete footings, 25° tilt facing +Z,
 * string combiner box on the front post. Cell layout is a runtime canvas texture.
 * Origin: floor, centre of the table.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { tagPlateMaterial } from "./Cabinet";
import { ledMaterial, texturedMaterial } from "./materials";
import { Box, Cyl, Gland, Instanced, Pipe, Plate, RBox, type InstanceItem, type V3 } from "./parts";
import { pvModuleTexture } from "./textures";
import type { ModelProps } from "./types";

export const PV = { rows: 2, cols: 3, pw: 1.134, ph: 1.722, gap: 0.02, tilt: (25 * Math.PI) / 180, h0: 0.6 };

export function PvArray({ ledColor, label }: ModelProps) {
  const { rows, cols, pw, ph, gap, tilt, h0 } = PV;
  const tableW = cols * pw + (cols - 1) * gap;
  const tableL = rows * ph + (rows - 1) * gap;
  const yc = h0 + (tableL / 2) * Math.sin(tilt);
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const toWorld = (x: number, y: number, z: number): V3 => [x, yc + y * cos - z * sin, y * sin + z * cos];

  const glass = texturedMaterial("pvGlass", () => {
    const map = pvModuleTexture();
    return new THREE.MeshPhysicalMaterial({ map, color: map ? "#ffffff" : "#18202c", roughness: 0.16, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05 });
  });

  const panels = useMemo(() => {
    const out: Array<{ x: number; z: number }> = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ x: (c - (cols - 1) / 2) * (pw + gap), z: (r - (rows - 1) / 2) * (ph + gap) });
    return out;
  }, [rows, cols, pw, ph, gap]);
  const glassItems = useMemo<InstanceItem[]>(() => panels.map((p) => ({ p: [p.x, 0, p.z], r: [-Math.PI / 2, 0, 0] })), [panels]);
  const frameItems = useMemo<InstanceItem[]>(
    () =>
      panels.flatMap((p) => [
        { p: [p.x - pw / 2 + 0.0175, -0.0135, p.z] as V3, s: [0.035, 0.035, ph] as V3 },
        { p: [p.x + pw / 2 - 0.0175, -0.0135, p.z] as V3, s: [0.035, 0.035, ph] as V3 },
        { p: [p.x, -0.0135, p.z - ph / 2 + 0.0175] as V3, s: [pw - 0.07, 0.035, 0.035] as V3 },
        { p: [p.x, -0.0135, p.z + ph / 2 - 0.0175] as V3, s: [pw - 0.07, 0.035, 0.035] as V3 },
      ]),
    [panels, pw, ph],
  );
  const backItems = useMemo<InstanceItem[]>(() => panels.map((p) => ({ p: [p.x, -0.012, p.z], s: [pw - 0.03, 0.004, ph - 0.03] })), [panels, pw, ph]);
  const jboxItems = useMemo<InstanceItem[]>(() => panels.map((p) => ({ p: [p.x, -0.03, p.z - ph / 2 + 0.2], s: [0.13, 0.022, 0.1] })), [panels, ph]);
  const rails = useMemo<InstanceItem[]>(() => {
    const out: InstanceItem[] = [];
    for (let r = 0; r < rows; r++) {
      const zc = (r - (rows - 1) / 2) * (ph + gap);
      for (const k of [-0.3, 0.3]) out.push({ p: [0, -0.052, zc + k * ph], s: [tableW + 0.12, 0.04, 0.042] });
    }
    return out;
  }, [rows, ph, gap, tableW]);
  const rafterXs = useMemo(() => {
    const n = Math.max(2, Math.ceil(tableW / 1.5) + 1);
    return Array.from({ length: n }, (_, i) => -tableW / 2 + 0.25 + (i * (tableW - 0.5)) / (n - 1));
  }, [tableW]);
  const rafters = useMemo<InstanceItem[]>(() => rafterXs.map((x) => ({ p: [x, -0.112, 0], s: [0.05, 0.075, tableL + 0.08] })), [rafterXs, tableL]);

  const legs = useMemo(() => {
    const zf = tableL / 2 - 0.3;
    const zb = -tableL / 2 + 0.3;
    return rafterXs.flatMap((x) => {
      const top = toWorld(x, -0.15, zf);
      const topB = toWorld(x, -0.15, zb);
      return [
        { x, z: top[2], h: top[1], front: true, other: topB },
        { x, z: topB[2], h: topB[1], front: false, other: top },
      ];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rafterXs, tableL, yc]);

  const combiner = legs.find((l) => l.front)!;

  return (
    <group>
      {/* footings + posts + braces */}
      {legs.map((l, i) => (
        <group key={i}>
          <Cyl r={0.16} h={0.14} position={[l.x, 0.05, l.z]} m="concrete" seg={24} />
          <Box size={[0.2, 0.012, 0.2]} position={[l.x, 0.126, l.z]} m="galvanised" />
          <Box size={[0.06, l.h - 0.12, 0.06]} position={[l.x, 0.12 + (l.h - 0.12) / 2, l.z]} m="galvanised" />
          {!l.front ? <Pipe from={[l.x, 0.35, l.z + 0.04]} to={[l.x, l.other[1] * 0.25 + l.h * 0.55, l.other[2] - (l.other[2] - l.z) * 0.6]} r={0.016} m="galvanised" /> : null}
        </group>
      ))}
      {/* longitudinal brace between posts */}
      <Pipe from={[rafterXs[0]!, 0.9, legs[1]!.z]} to={[rafterXs[rafterXs.length - 1]!, 1.35, legs[1]!.z]} r={0.014} m="galvanised" />

      <group position={[0, yc, 0]} rotation={[tilt, 0, 0]}>
        <Instanced items={rafters} m="galvanised">
          <boxGeometry args={[1, 1, 1]} />
        </Instanced>
        <Instanced items={rails} m="aluminium">
          <boxGeometry args={[1, 1, 1]} />
        </Instanced>
        <Instanced items={backItems} m="pvBacksheet">
          <boxGeometry args={[1, 1, 1]} />
        </Instanced>
        <Instanced items={jboxItems} m="plasticBlack">
          <boxGeometry args={[1, 1, 1]} />
        </Instanced>
        <Instanced items={frameItems} m="aluminium">
          <boxGeometry args={[1, 1, 1]} />
        </Instanced>
        <Instanced items={glassItems} m={glass}>
          <planeGeometry args={[pw - 0.034, ph - 0.034]} />
        </Instanced>
      </group>

      {/* string combiner box on the first front post */}
      <group position={[combiner.x + 0.0, 0.95, combiner.z + 0.12]}>
        <RBox size={[0.3, 0.36, 0.14]} radius={0.01} m="plasticGrey" />
        <Box size={[0.26, 0.004, 0.13]} position={[0, 0.12, 0.006]} m="gap" />
        {label ? <Plate size={[0.12, 0.03]} position={[0, 0.06, 0.071]} material={tagPlateMaterial(label)} /> : null}
        <Box size={[0.08, 0.006, 0.004]} position={[0, 0.0, 0.072]} m={ledColor ? ledMaterial(ledColor) : "ledOff"} />
        {[-0.08, 0, 0.08].map((x) => (
          <Gland key={x} position={[x, -0.18, 0]} r={0.01} tail={0.12} flip />
        ))}
      </group>
    </group>
  );
}
