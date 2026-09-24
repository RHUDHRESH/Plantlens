/**
 * Electrical equipment: MPPT charge controller (wall unit on a strut stand), dry-type and
 * oil-immersed transformers, LED luminaire on a pole.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { tagPlateMaterial } from "./Cabinet";
import { StrutStand } from "./Enclosures";
import { lensMaterial, ledMaterial, texturedMaterial } from "./materials";
import { BoltHeads, Box, Cyl, Gland, Instanced, Lathe, Pipe, Plate, RBox, type InstanceItem, type V3 } from "./parts";
import { displayTexture } from "./textures";
import type { ModelProps } from "./types";

/** MPPT solar charge controller: finned black-anodised heat sink, front cover with LCD + LEDs,
 * terminal compartment with glands, next to a DC isolator — on a galvanised backboard/stand. */
export function ChargeController({ ledColor, label }: ModelProps) {
  const unitY = 1.12;
  const sideFins = useMemo<InstanceItem[]>(() => {
    const out: InstanceItem[] = [];
    for (let i = 0; i < 7; i++) for (const s of [-1, 1]) out.push({ p: [s * (0.118 + 0.012 + i * 0.0), 0, -0.07 + i * 0.016] });
    return out;
  }, []);
  const screen = texturedMaterial("disp:mppt", () => {
    const map = displayTexture(["MPPT", "PV → BAT", ""], "oled");
    return new THREE.MeshStandardMaterial({ map, color: map ? "#fff" : "#0C0E10", emissive: "#ffffff", emissiveMap: map, emissiveIntensity: map ? 0.3 : 0 });
  });
  return (
    <group>
      <StrutStand width={0.4} height={1.6} depthOffset={-0.13} />
      <Box size={[0.46, 0.7, 0.012]} position={[0, 1.1, -0.1]} m="galvanised" />
      <group position={[-0.05, unitY, 0]}>
        {/* heat sink body with fins on both sides */}
        <RBox size={[0.23, 0.36, 0.1]} radius={0.006} position={[0, 0, -0.035]} m="anodisedBlack" />
        <Instanced items={sideFins} m="anodisedBlack">
          <boxGeometry args={[0.03, 0.34, 0.004]} />
        </Instanced>
        {/* front cover */}
        <RBox size={[0.22, 0.3, 0.04]} radius={0.01} position={[0, 0.02, 0.03]} m="paintMotor" />
        <Plate size={[0.08, 0.05]} position={[0, 0.09, 0.0505]} material={screen} />
        {[-0.04, 0, 0.04].map((x, i) => (
          <Cyl key={x} r={0.005} h={0.004} axis="z" position={[x, 0.03, 0.051]} m={i === 2 && ledColor ? ledMaterial(ledColor) : "ledOff"} seg={12} />
        ))}
        {/* terminal compartment + glands */}
        <RBox size={[0.22, 0.07, 0.07]} radius={0.006} position={[0, -0.155, 0.01]} m="plasticDark" />
        {[-0.075, -0.025, 0.025, 0.075].map((x) => (
          <Gland key={x} position={[x, -0.19, 0.01]} r={0.009} tail={0.18} flip />
        ))}
      </group>
      {/* DC isolator */}
      <group position={[0.16, unitY + 0.02, -0.03]}>
        <RBox size={[0.11, 0.16, 0.1]} radius={0.008} m="plasticGrey" />
        <Box size={[0.02, 0.07, 0.03]} position={[0, 0.01, 0.06]} m="plasticDark" />
        <Gland position={[0, -0.08, 0]} r={0.009} tail={0.14} flip />
      </group>
      {label ? <Plate size={[0.14, 0.035]} position={[0, 1.4, -0.092]} material={tagPlateMaterial(label)} /> : null}
    </group>
  );
}

/** Cast-resin dry-type transformer: 3-limb laminated core, clamps, HV/LV coils, delta links,
 * LV copper bars, base frame on wheels. */
export function TransformerDry({ ledColor, label }: ModelProps) {
  const limbX = [-0.42, 0, 0.42];
  const coreBot = 0.28;
  const coreTop = 1.42;
  return (
    <group>
      {/* base channel + wheels */}
      {[-0.28, 0.28].map((z) => (
        <Box key={z} size={[1.35, 0.12, 0.08]} position={[0, 0.16, z]} m="paintDark" />
      ))}
      {[-0.55, 0.55].flatMap((x) => [-0.28, 0.28].map((z) => (
        <group key={`${x}${z}`} position={[x, 0.07, z]}>
          <Cyl r={0.065} h={0.04} axis="z" m="castIron" />
          <Box size={[0.06, 0.06, 0.06]} position={[0, 0.03, 0]} m="paintDark" />
        </group>
      )))}
      {/* core: limbs + yokes */}
      {limbX.map((x) => (
        <Box key={x} size={[0.16, coreTop - coreBot, 0.16]} position={[x, (coreTop + coreBot) / 2, 0]} m="laminations" />
      ))}
      <Box size={[1.02, 0.18, 0.16]} position={[0, coreBot + 0.02, 0]} m="laminations" />
      <Box size={[1.02, 0.18, 0.16]} position={[0, coreTop - 0.02, 0]} m="laminations" />
      {/* yoke clamps */}
      {[coreBot + 0.02, coreTop - 0.02].flatMap((y) => [-1, 1].map((s) => (
        <Box key={`${y}${s}`} size={[1.12, 0.2, 0.025]} position={[0, y, s * 0.095]} m="paintDark" />
      )))}
      <BoltHeads points={[-0.5, -0.2, 0.2, 0.5].flatMap((x) => [[x, coreTop + 0.04, 0.11], [x, coreBot, 0.11]] as V3[])} axis="z" r={0.012} />
      {/* coils (cast resin HV outer, LV inner visible at ends) */}
      {limbX.map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <Cyl r={0.185} h={0.86} position={[0, (coreTop + coreBot) / 2, 0]} m="resin" seg={48} />
          <Cyl r={0.2} h={0.03} position={[0, (coreTop + coreBot) / 2 + 0.43, 0]} m="resin" seg={48} />
          <Cyl r={0.2} h={0.03} position={[0, (coreTop + coreBot) / 2 - 0.43, 0]} m="resin" seg={48} />
          <Cyl r={0.13} h={0.94} position={[0, (coreTop + coreBot) / 2, 0]} m="insulator" seg={32} />
          {/* HV tap links */}
          {[-0.06, 0, 0.06].map((dy) => (
            <Cyl key={dy} r={0.012} h={0.02} axis="z" position={[0, (coreTop + coreBot) / 2 + dy - 0.1, 0.19]} m="brass" seg={6} />
          ))}
        </group>
      ))}
      {/* HV delta connections (copper tube, front) */}
      <Pipe from={[-0.42, 1.28, 0.2]} to={[0, 1.28, 0.2]} r={0.01} m="copper" />
      <Pipe from={[0, 1.28, 0.2]} to={[0.42, 1.28, 0.2]} r={0.01} m="copper" />
      <Pipe from={[-0.42, 1.28, 0.2]} to={[-0.42, 1.12, 0.2]} r={0.01} m="copper" />
      <Pipe from={[0.42, 1.28, 0.2]} to={[0.42, 1.12, 0.2]} r={0.01} m="copper" />
      {/* LV bars up the back */}
      {[-0.52, -0.42, -0.32, 0.12].map((x) => (
        <Box key={x} size={[0.06, 0.3, 0.01]} position={[x, 1.55, -0.2]} m="copper" />
      ))}
      <Box size={[1.12, 0.02, 0.1]} position={[0, 1.61, 0]} m="paintDark" />
      {/* temperature monitor */}
      <group position={[0.58, 1.1, 0.2]}>
        <RBox size={[0.14, 0.18, 0.08]} radius={0.008} m="plasticGrey" />
        <Box size={[0.08, 0.006, 0.004]} position={[0, 0.06, 0.041]} m={ledColor ? ledMaterial(ledColor) : "ledOff"} />
      </group>
      {label ? <Plate size={[0.16, 0.04]} position={[0, 1.42, 0.109]} material={tagPlateMaterial(label)} /> : null}
    </group>
  );
}

/** Oil-immersed distribution transformer: tank with radiator banks, conservator, HV porcelain
 * bushings, LV bushings, Buchholz pipe, skid. */
export function TransformerOil({ ledColor, label }: ModelProps) {
  const tankW = 1.1;
  const tankD = 0.7;
  const tankH = 1.2;
  const y0 = 0.14;
  const fins = useMemo<InstanceItem[]>(() => {
    const out: InstanceItem[] = [];
    for (const s of [-1, 1]) for (let i = 0; i < 12; i++) out.push({ p: [-tankW / 2 + 0.1 + i * ((tankW - 0.2) / 11), y0 + 0.62, s * (tankD / 2 + 0.16)] });
    return out;
  }, []);
  const shed: Array<[number, number]> = useMemo(() => {
    const p: Array<[number, number]> = [[0.05, 0]];
    for (let i = 0; i < 6; i++) p.push([0.07, i * 0.055 + 0.01], [0.04, i * 0.055 + 0.035], [0.04, i * 0.055 + 0.05]);
    p.push([0.02, 0.35], [0.02, 0.4], [0, 0.4]);
    return p;
  }, []);
  return (
    <group>
      {[-0.3, 0.3].map((z) => (
        <Box key={z} size={[1.4, 0.14, 0.1]} position={[0, 0.07, z]} m="paintDark" />
      ))}
      <RBox size={[tankW, tankH, tankD]} radius={0.02} position={[0, y0 + tankH / 2, 0]} m="paintBase" />
      <RBox size={[tankW + 0.06, 0.05, tankD + 0.06]} radius={0.01} position={[0, y0 + tankH + 0.02, 0]} m="paintBase" />
      {/* radiator banks with headers */}
      <Instanced items={fins} m="paintBase">
        <boxGeometry args={[0.018, 1.0, 0.3]} />
      </Instanced>
      {[-1, 1].flatMap((s) => [y0 + 0.14, y0 + 1.1].map((y) => (
        <Cyl key={`${s}${y}`} r={0.03} h={tankW - 0.12} axis="x" position={[0, y, s * (tankD / 2 + 0.06)]} m="paintBase" />
      )))}
      {/* conservator on brackets + Buchholz pipe */}
      <Cyl r={0.14} h={0.8} axis="x" position={[0.05, y0 + tankH + 0.42, -0.2]} m="paintBase" />
      {[-0.3, 0.4].map((x) => (
        <Box key={x} size={[0.05, 0.3, 0.05]} position={[x, y0 + tankH + 0.2, -0.2]} m="paintBase" />
      ))}
      <Pipe from={[-0.25, y0 + tankH + 0.05, -0.2]} to={[-0.25, y0 + tankH + 0.3, -0.2]} r={0.022} m="paintBase" />
      <RBox size={[0.08, 0.08, 0.08]} radius={0.01} position={[-0.25, y0 + tankH + 0.18, -0.2]} m="paintCasting" />
      <Cyl r={0.05} h={0.04} axis="x" position={[0.47, y0 + tankH + 0.42, -0.2]} m="sightGlass" />
      {/* HV porcelain bushings (3) + LV (4) */}
      {[-0.3, 0, 0.3].map((x) => (
        <group key={x} position={[x, y0 + tankH + 0.045, 0.12]}>
          <Lathe profile={shed} m="porcelain" seg={32} />
          <Cyl r={0.012} h={0.08} position={[0, 0.44, 0]} m="brass" />
        </group>
      ))}
      {[-0.36, -0.12, 0.12, 0.36].map((x) => (
        <group key={x} position={[x, y0 + tankH + 0.045, 0.28]}>
          <Lathe profile={[[0.04, 0], [0.04, 0.03], [0.05, 0.035], [0.03, 0.07], [0.03, 0.12], [0, 0.12]]} m="porcelain" seg={24} />
          <Box size={[0.04, 0.06, 0.01]} position={[0, 0.15, 0]} m="copper" />
        </group>
      ))}
      {/* tap changer handle, oil level/temperature dials */}
      <Cyl r={0.05} h={0.04} axis="z" position={[0.35, y0 + tankH - 0.25, tankD / 2 + 0.02]} m="paintCasting" />
      <Cyl r={0.045} h={0.03} axis="z" position={[-0.35, y0 + tankH - 0.25, tankD / 2 + 0.015]} m="plasticDark" />
      <Cyl r={0.037} h={0.004} axis="z" position={[-0.35, y0 + tankH - 0.25, tankD / 2 + 0.032]} m={ledColor ? ledMaterial(ledColor, 0.8) : "plasticGrey"} />
      {label ? <Plate size={[0.16, 0.04]} position={[0, y0 + tankH - 0.12, tankD / 2 + 0.0015]} material={tagPlateMaterial(label)} /> : null}
    </group>
  );
}

/** LED area luminaire on a galvanised pole with local isolator. Lens glows when running. */
export function Luminaire({ running, ledColor, label }: ModelProps) {
  const poleH = 2.35;
  const fins = useMemo<InstanceItem[]>(() => Array.from({ length: 11 }, (_, i) => ({ p: [-0.18 + i * 0.036, 0.045, 0] })), []);
  return (
    <group>
      <Box size={[0.22, 0.015, 0.22]} position={[0, 0.0075, 0]} m="galvanised" />
      <BoltHeads points={[[-0.08, 0.02, -0.08], [0.08, 0.02, -0.08], [-0.08, 0.02, 0.08], [0.08, 0.02, 0.08]]} r={0.012} />
      <Cyl r={0.045} r2={0.035} h={poleH} position={[0, poleH / 2, 0]} m="galvanised" seg={24} />
      <Cyl r={0.05} h={0.12} position={[0, 0.07, 0]} m="galvanised" seg={24} />
      {/* bracket arm */}
      <Pipe from={[0, poleH - 0.05, 0]} to={[0.32, poleH + 0.05, 0]} r={0.022} m="galvanised" />
      {/* luminaire head: die-cast body with fins, lens */}
      <group position={[0.36, poleH + 0.02, 0]} rotation={[0, 0, -0.12]}>
        <RBox size={[0.42, 0.06, 0.3]} radius={0.02} m="aluminiumBrushed" />
        <Instanced items={fins} m="aluminiumBrushed">
          <boxGeometry args={[0.006, 0.04, 0.26]} />
        </Instanced>
        <mesh position={[0, -0.031, 0]} rotation={[Math.PI / 2, 0, 0]} material={lensMaterial(!!running && !ledColor)}>
          <planeGeometry args={[0.36, 0.24]} />
        </mesh>
      </group>
      {/* local isolator on the pole */}
      <group position={[0, 1.25, 0.075]}>
        <RBox size={[0.1, 0.14, 0.07]} radius={0.008} m="plasticGrey" />
        <Box size={[0.02, 0.05, 0.02]} position={[0, 0.01, 0.045]} m="plasticDark" />
        <Box size={[0.06, 0.005, 0.004]} position={[0, -0.05, 0.036]} m={ledColor ? ledMaterial(ledColor) : "ledOff"} />
        <Gland position={[0, -0.07, 0]} r={0.008} tail={0.4} flip />
      </group>
      {label ? <Plate size={[0.12, 0.03]} position={[0, 1.55, 0.043]} material={tagPlateMaterial(label)} /> : null}
    </group>
  );
}
