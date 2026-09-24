/**
 * End-suction centrifugal pump set (ISO 2858 style, back-pull-out): volute casing with axial
 * suction and top discharge, bearing bracket, spacer coupling under a perforated guard, driven by
 * the TEFC motor model on a fabricated baseplate grouted onto a concrete plinth.
 * Pump end at −X, motor at +X. Origin: floor, centre of the plinth.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { InductionMotor, MOTOR } from "./InductionMotor";
import { texturedMaterial } from "./materials";
import { BoltHeads, Box, circlePoints, Cyl, Flange, Lathe, M, RBox, useGeometry, type V3 } from "./parts";
import { spiralHousingGeometry, spiralShape } from "./shapes";
import { nameplateTexture, perforationTexture } from "./textures";
import type { ModelProps } from "./types";

export function guardMaterial(key: string, repeat: [number, number]) {
  return texturedMaterial(`guard:${key}`, () => {
    const alphaMap = perforationTexture(repeat);
    return new THREE.MeshStandardMaterial({
      color: "#A6ABAE",
      metalness: 0.55,
      roughness: 0.45,
      side: THREE.DoubleSide,
      ...(alphaMap ? { alphaMap, alphaTest: 0.5 } : {}),
    });
  });
}

/** Bourdon-tube pressure gauge (Ø63) on a short stem, dial facing +Z. */
export function Gauge({ position }: { position: V3 }) {
  return (
    <group position={position}>
      <Cyl r={0.006} h={0.07} position={[0, 0.035, 0]} m="brass" seg={8} />
      <Cyl r={0.034} h={0.022} axis="z" position={[0, 0.095, 0]} m="stainless" seg={32} />
      <Cyl r={0.029} h={0.002} axis="z" position={[0, 0.095, 0.0115]} m="plasticGrey" seg={32} />
      <Box size={[0.002, 0.022, 0.001]} position={[0.005, 0.1, 0.013]} rotation={[0, 0, -0.6]} m="plasticBlack" />
    </group>
  );
}

export function PumpSet(props: ModelProps) {
  const baseTop = 0.2;
  const motorScale = 0.85;
  const motorX = 0.52;
  const shaftY = baseTop + 0.02 + MOTOR.shaftHeight * motorScale;
  const motorShaftTip = motorX - MOTOR.shaftTip * motorScale;

  const vx = -0.44; // volute centre
  const vDepth = 0.13;
  const r0 = 0.115;
  const r1 = 0.2;
  const outletH = 0.2;
  const volute = useGeometry(() => spiralHousingGeometry({ r0, r1, outletH, depth: vDepth, bevel: 0.018 }), []);
  const { outletX } = useMemo(() => spiralShape({ r0, r1, outletH }), []);
  const dischargeZ = -(outletX[0] + outletX[1]) / 2;

  const coverBolts = useMemo<V3[]>(() => circlePoints("x", 0.178, 12, 0, 0.2).map(([x, y, z]) => [x + vx + vDepth / 2 + 0.024, y + shaftY, z]), [shaftY, vx]);
  const guard = guardMaterial("coupling", [10, 5]);
  const pumpPlate = texturedMaterial("np-pump", () => {
    const map = nameplateTexture("CENTRIFUGAL PUMP", ["ISO 2858  80-50-200", "Q 50 m3/h  H 50 m", "n 2900 min-1"]);
    return new THREE.MeshStandardMaterial({ map, color: map ? "#ffffff" : "#C9CDD0", metalness: 0.6, roughness: 0.4 });
  });

  return (
    <group>
      {/* concrete plinth + grout */}
      <RBox size={[1.75, 0.1, 0.62]} radius={0.01} position={[0, 0.05, 0]} m="concrete" />
      {/* fabricated baseplate: side channels, cross members, drip-rim deck */}
      {[-0.245, 0.245].map((z) => (
        <RBox key={z} size={[1.62, 0.09, 0.07]} radius={0.004} position={[0, 0.145, z]} m="paintBase" />
      ))}
      {[-0.78, 0, 0.78].map((x) => (
        <Box key={x} size={[0.06, 0.08, 0.44]} position={[x, 0.14, 0]} m="paintBase" />
      ))}
      <RBox size={[1.64, 0.014, 0.56]} radius={0.004} position={[0, baseTop - 0.007, 0]} m="paintBase" />
      <BoltHeads points={[-0.7, -0.25, 0.25, 0.7].flatMap((x) => [[x, 0.197, 0.29], [x, 0.197, -0.29]] as V3[])} r={0.012} />

      {/* motor on shim pads, shaft towards the pump */}
      {[-0.15, 0.15].flatMap((dx) => [-0.135, 0.135].map((dz) => (
        <Box key={`${dx}${dz}`} size={[0.1, 0.02, 0.08]} position={[motorX + dx * motorScale, baseTop + 0.01, dz * motorScale]} m="steel" />
      )))}
      <group position={[motorX, baseTop + 0.02, 0]} rotation={[0, Math.PI, 0]} scale={motorScale}>
        <InductionMotor {...props} />
      </group>

      {/* spacer coupling */}
      <Cyl r={0.052} h={0.05} axis="x" position={[motorShaftTip - 0.02, shaftY, 0]} m="castIron" />
      <Cyl r={0.026} h={0.06} axis="x" position={[motorShaftTip - 0.075, shaftY, 0]} m="steel" />
      <Cyl r={0.052} h={0.05} axis="x" position={[motorShaftTip - 0.13, shaftY, 0]} m="castIron" />
      {/* perforated coupling guard: half-round hood on side sheets */}
      <group position={[motorShaftTip - 0.075, 0, 0]}>
        <mesh position={[0, shaftY, 0]} rotation={[0, 0, -Math.PI / 2]} material={guard}>
          <cylinderGeometry args={[0.1, 0.1, 0.24, 32, 1, true, Math.PI, Math.PI]} />
        </mesh>
        {[-0.1, 0.1].map((z) => (
          <mesh key={z} position={[0, (shaftY + baseTop) / 2, z]} material={guard}>
            <planeGeometry args={[0.24, shaftY - baseTop]} />
          </mesh>
        ))}
        <Box size={[0.25, 0.012, 0.22]} position={[0, baseTop + 0.006, 0]} m="paintSilver" />
      </group>

      {/* bearing bracket with lantern, oil sight glass and breather */}
      <Cyl r={0.062} h={0.28} axis="x" position={[motorShaftTip - 0.3, shaftY, 0]} m="paintCasting" />
      <Cyl r={0.07} h={0.03} axis="x" position={[motorShaftTip - 0.175, shaftY, 0]} m="paintCasting" />
      <Lathe profile={[[0.062, 0], [0.09, 0.05], [0.16, 0.075], [0.19, 0.085], [0.19, 0.1]]} rotation={[0, 0, Math.PI / 2]} position={[motorShaftTip - 0.44, shaftY, 0]} m="paintCasting" />
      <Cyl r={0.018} h={0.04} axis="x" position={[motorShaftTip - 0.16, shaftY, 0]} m="steel" />
      <Box size={[0.12, shaftY - baseTop - 0.04, 0.1]} position={[motorShaftTip - 0.3, (shaftY + baseTop) / 2 - 0.02, 0]} m="paintCasting" />
      <RBox size={[0.2, 0.022, 0.26]} radius={0.004} position={[motorShaftTip - 0.3, baseTop + 0.011, 0]} m="paintCasting" />
      <Cyl r={0.016} h={0.014} axis="z" position={[motorShaftTip - 0.32, shaftY - 0.025, 0.066]} m="sightGlass" />
      <mesh position={[motorShaftTip - 0.32, shaftY - 0.025, 0.066]} material={M("brass")}>
        <torusGeometry args={[0.016, 0.003, 8, 24]} />
      </mesh>
      <Cyl r={0.012} h={0.035} position={[motorShaftTip - 0.26, shaftY + 0.075, 0]} m="brass" seg={6} />

      {/* volute casing, casing cover with bolt ring, feet */}
      <mesh geometry={volute} position={[vx, shaftY, 0]} material={M("paintCasting")} />
      <Cyl r={0.19} h={0.03} axis="x" position={[vx + vDepth / 2 + 0.01, shaftY, 0]} m="paintCasting" seg={48} />
      <BoltHeads points={coverBolts} axis="x" r={0.009} />
      <Box size={[0.12, shaftY - r1 - baseTop + 0.03, 0.1]} position={[vx, baseTop + (shaftY - r1 - baseTop + 0.03) / 2, 0]} m="paintCasting" />
      <RBox size={[0.16, 0.022, 0.32]} radius={0.004} position={[vx, baseTop + 0.011, 0]} m="paintCasting" />

      {/* axial suction nozzle + flange (DN100) */}
      <Lathe profile={[[0.07, 0], [0.066, 0.05], [0.058, 0.09], [0.058, 0.11]]} rotation={[0, 0, Math.PI / 2]} position={[vx - vDepth / 2 + 0.01, shaftY, 0]} m="paintCasting" />
      <Flange r={0.11} t={0.024} axis="x" position={[vx - vDepth / 2 - 0.105, shaftY, 0]} face={-1} />
      {/* top discharge nozzle + flange (DN80) */}
      <Cyl r={0.048} r2={0.044} h={0.1} position={[vx, shaftY + outletH + 0.03, dischargeZ]} m="paintCasting" />
      <Flange r={0.1} t={0.022} axis="y" position={[vx, shaftY + outletH + 0.09, dischargeZ]} />
      {/* suction + discharge pressure gauges on siphon stubs */}
      <Gauge position={[vx - vDepth / 2 - 0.05, shaftY + 0.075, 0]} />
      <Gauge position={[vx, shaftY + outletH + 0.06, dischargeZ + 0.07]} />
      {/* pump nameplate on the bearing bracket */}
      <mesh position={[motorShaftTip - 0.3, shaftY - 0.005, 0.0635]} material={pumpPlate}>
        <planeGeometry args={[0.09, 0.05]} />
      </mesh>
      <BoltHeads points={circlePoints("x", 0.11, 8, 0, Math.PI / 8).map(([x, y, z]) => [x + motorShaftTip - 0.44, y + shaftY, z] as V3)} axis="x" r={0.007} />
      {/* casing drain + vent plugs */}
      <Cyl r={0.012} h={0.02} position={[vx, shaftY - r1 + 0.005, 0.07]} m="darkSteel" seg={6} />
      <Cyl r={0.01} h={0.018} axis="z" position={[vx, shaftY + 0.12, -0.02]} m="darkSteel" seg={6} />
    </group>
  );
}
