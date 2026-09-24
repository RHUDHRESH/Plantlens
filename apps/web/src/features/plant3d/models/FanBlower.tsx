/**
 * Direct-drive centrifugal fan: sheet-steel scroll housing (single inlet) with bell-mouth inlet
 * and guard at −X, tangential rectangular outlet with angle flange at the top, stiffened back
 * plate, motor on a pedestal at +X, common base frame. Origin: floor, centre of the base frame.
 */
import { useMemo } from "react";
import { InductionMotor, MOTOR } from "./InductionMotor";
import { BoltHeads, Box, circlePoints, Cyl, Instanced, Lathe, M, RBox, useGeometry, type InstanceItem, type V3 } from "./parts";
import { guardMaterial } from "./PumpSet";
import { spiralHousingGeometry, spiralShape } from "./shapes";
import type { ModelProps } from "./types";

export function FanBlower(props: ModelProps) {
  const cy = 0.74;
  const r0 = 0.34;
  const r1 = 0.52;
  const outletH = 0.7;
  const depth = 0.42;
  const sx = -0.28; // scroll centre x
  const scroll = useGeometry(() => spiralHousingGeometry({ r0, r1, outletH, depth, bevel: 0.014 }), []);
  const { outletX } = useMemo(() => spiralShape({ r0, r1, outletH }), []);
  const outW = outletX[1] - outletX[0];
  const outZ = -(outletX[0] + outletX[1]) / 2;
  const motorScale = 1.05;
  const motorX = 0.45;
  const pedestalTop = cy - MOTOR.shaftHeight * motorScale;

  const ribs = useMemo<InstanceItem[]>(
    () => [0, Math.PI / 3, (2 * Math.PI) / 3, Math.PI, (4 * Math.PI) / 3, (5 * Math.PI) / 3].map((a) => ({ p: [sx + depth / 2 + 0.012, cy + Math.cos(a) * 0.23, Math.sin(a) * 0.23], r: [a, 0, 0] })),
    [cy, sx],
  );
  const flangeBolts = useMemo<V3[]>(() => {
    const top = cy + outletH + 0.012;
    const pts: V3[] = [];
    for (let i = 0; i < 4; i++) {
      const x = sx - depth / 2 + ((i + 0.5) / 4) * depth;
      pts.push([x, top, outZ - outW / 2 - 0.022], [x, top, outZ + outW / 2 + 0.022]);
    }
    for (let i = 0; i < 3; i++) {
      const z = outZ - outW / 2 + ((i + 0.5) / 3) * outW;
      pts.push([sx - depth / 2 - 0.022, top, z], [sx + depth / 2 + 0.022, top, z]);
    }
    return pts;
  }, [cy, sx, outW, outZ]);
  const inletBolts = useMemo<V3[]>(() => circlePoints("x", 0.345, 12, 0).map(([x, y, z]) => [x + sx - depth / 2 - 0.1, y + cy, z]), [cy, sx]);
  const guard = guardMaterial("inlet", [8, 8]);

  return (
    <group>
      {/* base frame (RHS) */}
      {[-0.44, 0.44].map((z) => (
        <RBox key={z} size={[1.86, 0.1, 0.1]} radius={0.004} position={[0, 0.05, z]} m="paintDark" />
      ))}
      {[-0.88, -0.28, 0.2, 0.88].map((x) => (
        <Box key={x} size={[0.08, 0.08, 0.8]} position={[x, 0.05, 0]} m="paintDark" />
      ))}
      {/* scroll support legs */}
      {[-0.36, 0.36].map((z) => (
        <Box key={z} size={[0.36, cy - r1 * 0.8 - 0.08, 0.06]} position={[sx, 0.1 + (cy - r1 * 0.8 - 0.1) / 2, z]} m="paintDark" />
      ))}
      <Box size={[0.4, 0.05, 0.8]} position={[sx, cy - r1 * 0.85, 0]} m="paintDark" />

      {/* scroll housing + side-plate seams */}
      <mesh geometry={scroll} position={[sx, cy, 0]} material={M("paintBase")} />
      <Instanced items={ribs} m="paintBase">
        <boxGeometry args={[0.02, 0.26, 0.018]} />
      </Instanced>
      <Cyl r={0.09} h={0.03} axis="x" position={[sx + depth / 2 + 0.015, cy, 0]} m="paintBase" />
      {/* outlet angle flange */}
      <group position={[sx, cy + outletH + 0.006, outZ]}>
        <Box size={[depth + 0.09, 0.012, 0.045]} position={[0, 0, -outW / 2 - 0.022]} m="paintBase" />
        <Box size={[depth + 0.09, 0.012, 0.045]} position={[0, 0, outW / 2 + 0.022]} m="paintBase" />
        <Box size={[0.045, 0.012, outW]} position={[-depth / 2 - 0.022, 0, 0]} m="paintBase" />
        <Box size={[0.045, 0.012, outW]} position={[depth / 2 + 0.022, 0, 0]} m="paintBase" />
        <Box size={[depth - 0.01, 0.004, outW - 0.01]} position={[0, -0.02, 0]} m="gap" />
      </group>
      <BoltHeads points={flangeBolts} r={0.008} />
      {/* inspection door on the scroll */}
      <RBox size={[0.2, 0.012, 0.16]} radius={0.004} position={[sx, cy - r1 * 0.5, r1 * 0.87]} rotation={[Math.PI / 2 - 0.52, 0, 0]} m="paintBase" />
      {/* bell-mouth inlet with flange ring and guard */}
      <Lathe profile={[[0.27, 0], [0.265, 0.03], [0.28, 0.07], [0.33, 0.1], [0.36, 0.104]]} rotation={[0, 0, Math.PI / 2]} position={[sx - depth / 2 + 0.005, cy, 0]} m="paintBase" />
      <Cyl r={0.37} h={0.016} axis="x" position={[sx - depth / 2 - 0.1, cy, 0]} m="paintBase" seg={48} open />
      <BoltHeads points={inletBolts} axis="x" r={0.008} />
      <mesh position={[sx - depth / 2 - 0.108, cy, 0]} rotation={[0, -Math.PI / 2, 0]} material={guard}>
        <circleGeometry args={[0.355, 48]} />
      </mesh>
      <Cyl r={0.33} h={0.004} axis="x" position={[sx - depth / 2 + 0.02, cy, 0]} m="gap" seg={40} />
      <Cyl r={0.1} h={0.06} axis="x" position={[sx - depth / 2 + 0.05, cy, 0]} m="darkSteel" />

      {/* motor pedestal + motor, shaft into the back plate */}
      <RBox size={[0.46, pedestalTop - 0.1, 0.4]} radius={0.006} position={[motorX, 0.1 + (pedestalTop - 0.1) / 2, 0]} m="paintDark" />
      <group position={[motorX - 0.02, pedestalTop, 0]} rotation={[0, Math.PI, 0]} scale={motorScale}>
        <InductionMotor {...props} />
      </group>
      <Cyl r={0.03} h={0.12} axis="x" position={[sx + depth / 2 + 0.07, cy, 0]} m="steel" />
    </group>
  );
}
