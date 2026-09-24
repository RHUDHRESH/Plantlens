/**
 * Sheet-steel enclosures (RAL 7035) — the shared builder behind the drive cabinet, PLC cabinet,
 * DC distribution board and wall enclosures. Door with visible seam, swing handle, hinges, tag
 * plate, optional glazed door showing the interior, filter fans, keypad, top cable glands and an
 * LED status strip that lights ONLY when the equipment is abnormal.
 * Origin: floor, centre; front face towards +Z.
 */
import { useMemo, type ReactNode } from "react";
import * as THREE from "three";
import { ledMaterial, mat, texturedMaterial } from "./materials";
import { Box, Cyl, Gland, Instanced, M, Plate, RBox, useGeometry, type InstanceItem, type V3 } from "./parts";
import { frameShape } from "./shapes";
import { displayTexture, tagTexture } from "./textures";

export interface CabinetProps {
  w: number;
  h: number;
  d: number;
  plinth?: number;
  glazed?: boolean;
  interior?: ReactNode;
  filterFans?: boolean;
  keypad?: { lines: string[] } | null;
  ledColor?: string | null | undefined;
  label?: string | undefined;
  topGlands?: number;
  sideLouvres?: boolean;
}

export function tagPlateMaterial(label: string) {
  return texturedMaterial(`tag:${label}`, () => {
    const map = tagTexture(label);
    return new THREE.MeshStandardMaterial({ map, color: map ? "#ffffff" : "#F2F2EE", roughness: 0.4 });
  });
}

function FilterFan({ position, size = 0.25 }: { position: V3; size?: number }) {
  const slats = useMemo<InstanceItem[]>(() => {
    const n = 9;
    return Array.from({ length: n }, (_, i) => ({ p: [0, -size / 2 + 0.035 + (i * (size - 0.07)) / (n - 1), 0.012], r: [0.7, 0, 0] as V3 }));
  }, [size]);
  return (
    <group position={position}>
      <RBox size={[size, size, 0.02]} radius={0.006} m="plasticGrey" />
      <Box size={[size - 0.04, size - 0.04, 0.004]} position={[0, 0, 0.009]} m="plasticDark" />
      <Instanced items={slats} m="plasticGrey">
        <boxGeometry args={[size - 0.045, 0.018, 0.003]} />
      </Instanced>
    </group>
  );
}

function Keypad({ position, lines }: { position: V3; lines: string[] }) {
  const screen = useMemo(
    () =>
      texturedMaterial(`disp:${lines.join("|")}`, () => {
        const map = displayTexture(lines);
        return new THREE.MeshStandardMaterial({ map, color: map ? "#ffffff" : "#1B2426", emissive: "#ffffff", emissiveMap: map, emissiveIntensity: map ? 0.35 : 0, roughness: 0.25 });
      }),
    [lines],
  );
  const buttons = useMemo<InstanceItem[]>(() => {
    const out: InstanceItem[] = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push({ p: [-0.024 + c * 0.024, -0.02 - r * 0.02, 0.012], r: [Math.PI / 2, 0, 0] });
    return out;
  }, []);
  return (
    <group position={position}>
      <RBox size={[0.1, 0.15, 0.022]} radius={0.008} m="plasticDark" />
      <Plate size={[0.078, 0.048]} position={[0, 0.038, 0.0115]} material={screen} />
      <Instanced items={buttons} m="plasticMid">
        <cylinderGeometry args={[0.007, 0.007, 0.006, 16]} />
      </Instanced>
    </group>
  );
}

export function Cabinet({
  w,
  h,
  d,
  plinth = 0.1,
  glazed = false,
  interior,
  filterFans = false,
  keypad = null,
  ledColor = null,
  label,
  topGlands = 0,
  sideLouvres = false,
}: CabinetProps) {
  const y0 = plinth;
  const yc = y0 + h / 2;
  const front = d / 2;
  const t = 0.018; // panel thickness
  const doorW = w - 0.014;
  const doorH = h - 0.014;
  const doorFrame = useGeometry(() => {
    const g = new THREE.ExtrudeGeometry(frameShape(doorW, doorH, Math.min(0.085, w * 0.12)), { depth: 0.02, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2 });
    g.translate(0, 0, -0.01);
    return g;
  }, [doorW, doorH, w]);

  const louvres = useMemo<InstanceItem[]>(() => {
    if (!sideLouvres) return [];
    const out: InstanceItem[] = [];
    for (const side of [-1, 1]) {
      for (const band of [y0 + 0.18, y0 + h - 0.32]) {
        for (let i = 0; i < 6; i++) out.push({ p: [side * (w / 2 + 0.003), band + i * 0.028, 0], r: [0, 0, side * 0.5] });
      }
    }
    return out;
  }, [sideLouvres, w, h, y0]);

  const glandPts = useMemo<V3[]>(() => Array.from({ length: topGlands }, (_, i) => [-w / 2 + 0.1 + (i * (w - 0.2)) / Math.max(1, topGlands - 1), y0 + h + 0.02, -d * 0.15]), [topGlands, w, h, d, y0]);

  return (
    <group>
      {/* plinth */}
      {plinth > 0 ? (
        <>
          <Box size={[w, plinth, d - 0.02]} position={[0, plinth / 2, -0.01]} m="plasticBlack" />
          <Box size={[w - 0.04, plinth - 0.03, 0.004]} position={[0, plinth / 2, front - 0.018]} m="plasticDark" />
        </>
      ) : null}

      {/* carcass */}
      {glazed ? (
        <group>
          <Box size={[w, h, t]} position={[0, yc, -front + t / 2 + 0.01]} m="paintLight" />
          <Box size={[t, h, d - 0.03]} position={[-w / 2 + t / 2, yc, -0.005]} m="paintLight" />
          <Box size={[t, h, d - 0.03]} position={[w / 2 - t / 2, yc, -0.005]} m="paintLight" />
          <Box size={[w, t, d - 0.03]} position={[0, y0 + h - t / 2, -0.005]} m="paintLight" />
          <Box size={[w, t, d - 0.03]} position={[0, y0 + t / 2, -0.005]} m="paintLight" />
          {/* galvanised mounting plate + interior */}
          <Box size={[w - 0.08, h - 0.1, 0.004]} position={[0, yc, -front + 0.06]} m="galvanised" />
          <group position={[0, yc, -front + 0.062]}>{interior}</group>
        </group>
      ) : (
        <RBox size={[w, h, d - 0.03]} radius={0.006} position={[0, yc, -0.015 - 0.0]} m="paintLight" />
      )}

      {/* door seam + door */}
      {glazed ? null : <Box size={[w - 0.004, h - 0.004, 0.008]} position={[0, yc, front - 0.026]} m="gap" />}
      {glazed ? (
        <group position={[0, yc, front - 0.012]}>
          <mesh geometry={doorFrame} material={M("paintLightDoor")} />
          <mesh position={[0, 0, -0.004]} material={mat("polycarbonate")} renderOrder={2}>
            <planeGeometry args={[doorW - 0.16, doorH - 0.16]} />
          </mesh>
        </group>
      ) : (
        <RBox size={[doorW, doorH, 0.024]} radius={0.007} position={[0, yc, front - 0.012]} m="paintLightDoor" />
      )}

      {/* swing handle + lock insert */}
      <group position={[w / 2 - 0.05, yc, front + 0.002]}>
        <RBox size={[0.034, 0.17, 0.014]} radius={0.005} m="plasticBlack" />
        <RBox size={[0.022, 0.12, 0.016]} radius={0.006} position={[0, -0.01, 0.012]} m="plasticDark" />
        <Cyl r={0.007} h={0.006} axis="z" position={[0, 0.065, 0.01]} m="aluminium" />
      </group>
      {/* hinges */}
      {[0.12, 0.5, 0.88].map((f) => (
        <Cyl key={f} r={0.009} h={0.06} position={[-w / 2 + 0.004, y0 + h * f, front - 0.008]} m="plasticDark" seg={16} />
      ))}

      {/* tag plate + LED strip (dark unless abnormal) */}
      {label ? <Plate size={[0.16, 0.04]} position={[0, y0 + h - 0.075, front + 0.0015]} material={tagPlateMaterial(label)} /> : null}
      <RBox size={[Math.min(0.3, w * 0.5), 0.012, 0.008]} radius={0.003} position={[0, y0 + h - 0.125, front + 0.003]} m="plasticDark" />
      <Box size={[Math.min(0.28, w * 0.48), 0.005, 0.004]} position={[0, y0 + h - 0.125, front + 0.0075]} m={ledColor ? ledMaterial(ledColor) : "ledOff"} />

      {keypad ? (
        <>
          <Keypad position={[0, y0 + h * 0.66, front + 0.011]} lines={keypad.lines} />
          {/* 22 mm pilot lights (unlit grey lenses) + main isolator handle */}
          {[-0.06, 0, 0.06].map((x) => (
            <group key={x} position={[x, y0 + h * 0.66 + 0.16, front + 0.012]}>
              <Cyl r={0.015} h={0.01} axis="z" m="aluminium" seg={24} />
              <Cyl r={0.011} h={0.008} axis="z" position={[0, 0, 0.007]} m="ledOff" seg={24} />
            </group>
          ))}
          <group position={[0, y0 + h * 0.66 - 0.2, front + 0.012]}>
            <RBox size={[0.09, 0.09, 0.012]} radius={0.006} m="plasticDark" />
            <Cyl r={0.03} h={0.02} axis="z" position={[0, 0, 0.014]} m="plasticDark" />
            <RBox size={[0.075, 0.018, 0.022]} radius={0.006} position={[0, 0, 0.03]} m="plasticBlack" />
          </group>
        </>
      ) : null}
      {keypad ? (
        /* engraved instruction plate (grey, no colour) */
        <Plate size={[0.12, 0.06]} position={[0, y0 + h * 0.66 - 0.32, front + 0.0015]} material={tagPlateMaterial("LOCK OUT")} />
      ) : null}
      {filterFans ? (
        <>
          <FilterFan position={[0, y0 + 0.32, front + 0.01]} />
          <FilterFan position={[0, y0 + h - 0.36, front + 0.01]} size={0.22} />
        </>
      ) : null}

      <Instanced items={louvres} m="paintLight">
        <boxGeometry args={[0.006, 0.012, d * 0.5]} />
      </Instanced>

      {/* roof + top cable glands */}
      <RBox size={[w + 0.01, 0.02, d - 0.02]} radius={0.004} position={[0, y0 + h + 0.008, -0.01]} m="paintLight" />
      {glandPts.map((p, i) => (
        <Gland key={i} position={p} r={0.016 - (i % 2) * 0.004} tail={0.14} />
      ))}
    </group>
  );
}

/** DIN-rail interior: wire ducts, PLC rack, terminal blocks, MCBs. Local origin at plate centre. */
export function PanelInterior({ w, h, variant }: { w: number; h: number; variant: "plc" | "dc" }) {
  const inner = w - 0.16;
  const rows = variant === "plc" ? [0.28, 0.02, -0.26] : [0.02, -0.26];
  const ducts = useMemo<InstanceItem[]>(() => {
    const ys = [h / 2 - 0.12, 0.16, -0.12, -0.4, -h / 2 + 0.1];
    const out: InstanceItem[] = ys.map((y) => ({ p: [0, y, 0.03], s: [inner, 0.06, 0.06] }));
    out.push({ p: [-w / 2 + 0.07, 0, 0.03], s: [0.05, h - 0.2, 0.06] }, { p: [w / 2 - 0.07, 0, 0.03], s: [0.05, h - 0.2, 0.06] });
    return out;
  }, [w, h, inner]);
  const plcModules = useMemo<InstanceItem[]>(() => {
    const out: InstanceItem[] = [];
    let x = -inner / 2 + 0.07;
    out.push({ p: [x, 0.29, 0.065], s: [0.075, 0.13, 0.12] }); // PSU
    x += 0.08;
    out.push({ p: [x + 0.02, 0.29, 0.065], s: [0.07, 0.13, 0.12] }); // CPU
    x += 0.075;
    for (let i = 0; i < 8 && x < inner / 2 - 0.02; i++, x += 0.037) out.push({ p: [x + 0.02, 0.29, 0.065], s: [0.035, 0.13, 0.12] });
    return out;
  }, [inner]);
  const terminals = useMemo<InstanceItem[]>(() => {
    const out: InstanceItem[] = [];
    const n = Math.floor(inner / 0.0065);
    for (let i = 0; i < n; i++) out.push({ p: [-inner / 2 + i * 0.0065 + 0.003, -0.26, 0.03], s: [0.0055, 0.06, 0.045] });
    return out;
  }, [inner]);
  const breakers = useMemo<InstanceItem[]>(() => {
    const out: InstanceItem[] = [];
    const n = Math.floor((inner - 0.02) / 0.0185);
    for (let i = 0; i < n; i++) out.push({ p: [-inner / 2 + 0.01 + i * 0.0185 + 0.009, 0.02, 0.04], s: [0.0175, 0.09, 0.07] });
    return out;
  }, [inner]);
  const toggles = useMemo<InstanceItem[]>(() => breakers.map((b) => ({ p: [b.p[0], 0.02, 0.08], s: [0.008, 0.02, 0.012] })), [breakers]);
  const busbars = useMemo<InstanceItem[]>(() => [0.36, 0.3, 0.24].map((y) => ({ p: [0, y, 0.07], s: [inner - 0.04, 0.03, 0.008] })), [inner]);
  const insulators = useMemo<InstanceItem[]>(() => {
    const out: InstanceItem[] = [];
    for (const x of [-inner / 2 + 0.04, 0, inner / 2 - 0.04]) for (const y of [0.36, 0.3, 0.24]) out.push({ p: [x, y, 0.035], r: [Math.PI / 2, 0, 0] });
    return out;
  }, [inner]);
  return (
    <group>
      <Instanced items={ducts} m="plasticMid">
        <boxGeometry args={[1, 1, 1]} />
      </Instanced>
      {/* DIN rails */}
      {rows.map((y) => (
        <Box key={y} size={[inner, 0.035, 0.008]} position={[0, y, 0.006]} m="galvanised" />
      ))}
      {variant === "plc" ? (
        <Instanced items={plcModules} m="plasticDark">
          <boxGeometry args={[1, 1, 1]} />
        </Instanced>
      ) : (
        <>
          <Instanced items={insulators} m="insulator">
            <cylinderGeometry args={[0.012, 0.014, 0.06, 12]} />
          </Instanced>
          <Instanced items={busbars} m="copper">
            <boxGeometry args={[1, 1, 1]} />
          </Instanced>
          {/* polycarbonate shroud over the busbars */}
          <mesh position={[0, 0.3, 0.11]} material={mat("polycarbonate")} renderOrder={2}>
            <planeGeometry args={[inner, 0.2]} />
          </mesh>
          <Box size={[inner, 0.008, 0.045]} position={[0, 0.4, 0.09]} m="plasticMid" />
          <Box size={[inner, 0.008, 0.045]} position={[0, 0.2, 0.09]} m="plasticMid" />
        </>
      )}
      <Instanced items={breakers} m="plasticGrey">
        <boxGeometry args={[1, 1, 1]} />
      </Instanced>
      <Instanced items={toggles} m="plasticBlack">
        <boxGeometry args={[1, 1, 1]} />
      </Instanced>
      <Instanced items={terminals} m="plasticGrey">
        <boxGeometry args={[1, 1, 1]} />
      </Instanced>
    </group>
  );
}
