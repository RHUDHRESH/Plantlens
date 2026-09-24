/**
 * LiFePO4 battery rack: RAL 7016 open frame with shelves, 19" rack modules (instanced) with
 * front handles, + / − terminals with shrouds and series busbar links, BMS/master module with
 * display and DC breaker at the top. Origin: floor, centre; fronts face +Z.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { ledMaterial, texturedMaterial } from "./materials";
import { Box, Cyl, Gland, Instanced, Plate, RBox, type InstanceItem, type V3 } from "./parts";
import { tagPlateMaterial } from "./Cabinet";
import { displayTexture } from "./textures";
import type { ModelProps } from "./types";

export function BatteryRack({ ledColor, label }: ModelProps) {
  const W = 0.6;
  const D = 0.6;
  const H = 1.7;
  const post = 0.04;
  const modules = 8;
  const modH = 0.133; // 3U
  const pitch = 0.155;
  const firstY = 0.14;
  const modW = 0.44;
  const modD = 0.5;
  const front = D / 2 - 0.03;
  const bmsY = firstY + modules * pitch + 0.02;

  const modItems = useMemo<InstanceItem[]>(() => Array.from({ length: modules }, (_, i) => ({ p: [0, firstY + i * pitch + modH / 2, -0.01] })), []);
  const faceItems = useMemo<InstanceItem[]>(() => modItems.map((m) => ({ p: [0, m.p[1], front - 0.004] })), [modItems, front]);
  const earItems = useMemo<InstanceItem[]>(() => modItems.flatMap((m) => [-1, 1].map((s) => ({ p: [s * (modW / 2 + 0.025), m.p[1], front - 0.002] as V3 }))), [modItems, front]);
  const handleItems = useMemo<InstanceItem[]>(
    () => modItems.flatMap((m) => [-1, 1].map((s) => ({ p: [s * (modW / 2 + 0.028), m.p[1], front + 0.002] as V3, r: [Math.PI / 2, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2] as V3 }))),
    [modItems, front],
  );
  const posTerms = useMemo<InstanceItem[]>(() => modItems.map((m, i) => ({ p: [i % 2 ? 0.12 : -0.12, m.p[1] + 0.02, front + 0.012] as V3, r: [Math.PI / 2, 0, 0] as V3 })), [modItems, front]);
  const negTerms = useMemo<InstanceItem[]>(() => modItems.map((m, i) => ({ p: [i % 2 ? -0.12 : 0.12, m.p[1] - 0.02, front + 0.012] as V3, r: [Math.PI / 2, 0, 0] as V3 })), [modItems, front]);
  // series links: + of module i to − of module i+1 (alternating sides → straight vertical straps)
  const links = useMemo<InstanceItem[]>(() => {
    const out: InstanceItem[] = [];
    for (let i = 0; i < modules - 1; i++) {
      const x = i % 2 ? 0.12 : -0.12;
      const y0 = modItems[i]!.p[1] + 0.02;
      const y1 = modItems[i + 1]!.p[1] - 0.02;
      out.push({ p: [x, (y0 + y1) / 2, front + 0.028], s: [0.024, y1 - y0 + 0.02, 0.004] });
    }
    return out;
  }, [modItems, front]);
  const socLeds = useMemo<InstanceItem[]>(() => modItems.flatMap((m) => [0, 1, 2, 3].map((k) => ({ p: [-0.03 + k * 0.02, m.p[1] - 0.045, front + 0.003] as V3 }))), [modItems, front]);
  const ports = useMemo<InstanceItem[]>(() => modItems.flatMap((m) => [0.02, 0.045].map((x) => ({ p: [x, m.p[1] + 0.03, front + 0.003] as V3 }))), [modItems, front]);
  const switches = useMemo<InstanceItem[]>(() => modItems.map((m) => ({ p: [0.06, m.p[1] - 0.015, front + 0.006] as V3 })), [modItems, front]);
  const shelves = useMemo<InstanceItem[]>(() => modItems.map((m) => ({ p: [0, m.p[1] - modH / 2 - 0.006, -0.01] })), [modItems]);

  const bmsScreen = texturedMaterial("disp:bms", () => {
    const map = displayTexture(["BMS", "48 V  LFP", ""]);
    return new THREE.MeshStandardMaterial({ map, color: map ? "#fff" : "#1B2426", emissive: "#ffffff", emissiveMap: map, emissiveIntensity: map ? 0.3 : 0 });
  });

  return (
    <group>
      {/* frame: posts, top/bottom rings, side braces, levelling feet */}
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
        <group key={`${sx}${sz}`} position={[sx * (W / 2 - post / 2), 0, sz * (D / 2 - post / 2)]}>
          <Box size={[post, H - 0.05, post]} position={[0, 0.05 + (H - 0.05) / 2, 0]} m="paintDark" />
          <Cyl r={0.02} h={0.04} position={[0, 0.02, 0]} m="darkSteel" seg={6} />
          <Cyl r={0.03} h={0.008} position={[0, 0.004, 0]} m="rubber" />
        </group>
      )))}
      {[0.07, H - 0.02].flatMap((y) => [
        <Box key={`f${y}`} size={[W, 0.04, 0.04]} position={[0, y, D / 2 - 0.02]} m="paintDark" />,
        <Box key={`b${y}`} size={[W, 0.04, 0.04]} position={[0, y, -D / 2 + 0.02]} m="paintDark" />,
        <Box key={`l${y}`} size={[0.04, 0.04, D]} position={[-W / 2 + 0.02, y, 0]} m="paintDark" />,
        <Box key={`r${y}`} size={[0.04, 0.04, D]} position={[W / 2 - 0.02, y, 0]} m="paintDark" />,
      ])}
      <Box size={[W - 0.06, H - 0.1, 0.006]} position={[0, H / 2, -D / 2 + 0.01]} m="paintDark" />
      <Instanced items={shelves} m="paintDark">
        <boxGeometry args={[W - 0.02, 0.012, D - 0.06]} />
      </Instanced>

      {/* modules: steel case, dark front, rack ears, handles */}
      <Instanced items={modItems} m="paintBase">
        <boxGeometry args={[modW, modH, modD]} />
      </Instanced>
      <Instanced items={faceItems} m="plasticDark">
        <boxGeometry args={[modW + 0.01, modH - 0.006, 0.008]} />
      </Instanced>
      <Instanced items={earItems} m="paintDark">
        <boxGeometry args={[0.05, modH - 0.01, 0.004]} />
      </Instanced>
      <Instanced items={handleItems} m="darkSteel">
        <torusGeometry args={[0.03, 0.005, 8, 16, Math.PI]} />
      </Instanced>
      <Instanced items={ports} m="plasticBlack">
        <boxGeometry args={[0.018, 0.016, 0.006]} />
      </Instanced>
      <Instanced items={switches} m="plasticBlack">
        <boxGeometry args={[0.024, 0.036, 0.012]} />
      </Instanced>
      {/* terminals with shrouds, series links */}
      <Instanced items={posTerms} m="plasticDark">
        <cylinderGeometry args={[0.016, 0.016, 0.022, 16]} />
      </Instanced>
      <Instanced items={negTerms} m="plasticDark">
        <cylinderGeometry args={[0.016, 0.016, 0.022, 16]} />
      </Instanced>
      <Instanced items={links} m="copper">
        <boxGeometry args={[1, 1, 1]} />
      </Instanced>
      <Instanced items={socLeds} m="ledOff">
        <boxGeometry args={[0.012, 0.005, 0.003]} />
      </Instanced>

      {/* BMS / master module with display, DC breaker, status LED strip */}
      <RBox size={[modW + 0.06, 0.13, modD]} radius={0.004} position={[0, bmsY + 0.065, -0.01]} m="paintLight" />
      <Box size={[modW + 0.06, 0.12, 0.008]} position={[0, bmsY + 0.065, front - 0.004]} m="plasticDark" />
      <Plate size={[0.09, 0.056]} position={[-0.13, bmsY + 0.07, front + 0.001]} material={bmsScreen} />
      <RBox size={[0.07, 0.09, 0.05]} radius={0.004} position={[0.13, bmsY + 0.065, front + 0.02]} m="plasticDark" />
      <Box size={[0.02, 0.035, 0.02]} position={[0.13, bmsY + 0.075, front + 0.05]} m="plasticGrey" />
      <Box size={[0.1, 0.006, 0.004]} position={[0.0, bmsY + 0.03, front + 0.002]} m={ledColor ? ledMaterial(ledColor) : "ledOff"} />
      {label ? <Plate size={[0.14, 0.036]} position={[0, H - 0.02, D / 2 + 0.0015]} material={tagPlateMaterial(label)} /> : null}
      {/* main cables out of the top */}
      <Gland position={[-0.12, H, -0.1]} r={0.016} tail={0.16} />
      <Gland position={[0.12, H, -0.1]} r={0.016} tail={0.16} />
    </group>
  );
}
