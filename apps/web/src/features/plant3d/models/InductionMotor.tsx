/**
 * TEFC squirrel-cage induction motor, foot-mounted (IEC B3), proportions of an IEC 200 frame:
 * shaft height 200 mm, drive end (DE) towards +X, fan cowl at the non-drive end (NDE, −X).
 * Origin: floor, centre of the feet.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { nameplateTexture } from "./textures";
import { texturedMaterial } from "./materials";
import { BoltHeads, Box, circlePoints, Cyl, Gland, Instanced, Lathe, M, RBox, useGeometry, type InstanceItem, type V3 } from "./parts";
import type { ModelProps } from "./types";

export const MOTOR = {
  shaftHeight: 0.2,
  coreR: 0.132,
  finH: 0.03,
  bodyStart: -0.2,
  bodyEnd: 0.24,
  shaftTip: 0.385,
};

function footShape() {
  const s = new THREE.Shape();
  const w = 0.1;
  const d = 0.075;
  s.moveTo(-w / 2, -d / 2);
  s.lineTo(w / 2, -d / 2);
  s.lineTo(w / 2, d / 2);
  s.lineTo(-w / 2, d / 2);
  s.lineTo(-w / 2, -d / 2);
  // slotted bolt hole
  const hole = new THREE.Path();
  const r = 0.009;
  hole.absarc(-0.012, 0.008, r, Math.PI / 2, (3 * Math.PI) / 2, false);
  hole.absarc(0.012, 0.008, r, (3 * Math.PI) / 2, Math.PI / 2, false);
  s.holes.push(hole);
  return s;
}

export function InductionMotor({ label }: ModelProps) {
  const H = MOTOR.shaftHeight;
  const R = MOTOR.coreR;
  const fh = MOTOR.finH;
  const x0 = MOTOR.bodyStart;
  const x1 = MOTOR.bodyEnd;
  const L = x1 - x0;
  const xc = (x0 + x1) / 2;

  const fins = useMemo<InstanceItem[]>(() => {
    const out: InstanceItem[] = [];
    const n = 40;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2; // 0 = top (+Y), rotating towards +Z
      const fromBottom = Math.abs(a - Math.PI);
      if (fromBottom < 0.62) continue; // cast feet region
      const rr = R + fh / 2 - 0.002;
      out.push({ p: [xc - 0.004, H + Math.cos(a) * rr, Math.sin(a) * rr], r: [a, 0, 0] });
    }
    return out;
  }, [H, R, fh, xc]);

  const footGeom = useGeometry(() => {
    const g = new THREE.ExtrudeGeometry(footShape(), { depth: 0.028, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 1 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.003, 0);
    return g;
  }, []);

  const webGeom = useGeometry(() => {
    const sh = new THREE.Shape();
    const hgt = H - R * 0.55;
    sh.moveTo(-0.045, 0);
    sh.lineTo(0.045, 0);
    sh.quadraticCurveTo(0.03, hgt * 0.35, 0.028, hgt);
    sh.lineTo(-0.028, hgt);
    sh.quadraticCurveTo(-0.03, hgt * 0.35, -0.045, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.028, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 1 });
    g.translate(0, 0.02, -0.014);
    return g;
  }, [H, R]);

  const shieldBolts = useMemo<V3[]>(
    () =>
      [...circlePoints("x", R + 0.004, 6, x1 + 0.014, Math.PI / 6), ...circlePoints("x", 0.047, 4, x1 + 0.052, Math.PI / 4)].map(
        ([x, y, z]) => [x, y + H, z] as V3,
      ),
    [H, R, x1],
  );

  const feet: V3[] = [
    [xc - 0.15, 0, 0.135],
    [xc + 0.15, 0, 0.135],
    [xc - 0.15, 0, -0.135],
    [xc + 0.15, 0, -0.135],
  ];

  const deShield: Array<[number, number]> = [
    [R + 0.012, 0],
    [R + 0.012, 0.012],
    [R - 0.005, 0.022],
    [0.08, 0.034],
    [0.062, 0.036],
    [0.058, 0.05],
    [0.035, 0.052],
    [0.03, 0.052],
    [0, 0.052],
  ];
  const cowl: Array<[number, number]> = [
    [R + fh + 0.004, 0],
    [R + fh + 0.004, 0.13],
    [R + fh - 0.004, 0.145],
    [R + fh - 0.014, 0.152],
    [R + fh - 0.022, 0.1505],
  ];

  const ventRings = [0.038, 0.058, 0.078, 0.098, 0.118, 0.137];

  const tbX = xc + 0.03;
  const tbY = H + R + fh + 0.045;

  const plate = useMemo(
    () =>
      texturedMaterial(`np-motor`, () => {
        const map = nameplateTexture("3~ Mot.  IEC 60034", ["18.5 kW  400 V D  50 Hz", "33.5 A   1470 min-1", "cos φ 0.86  IP55  IE3"]);
        return new THREE.MeshStandardMaterial({ map, color: map ? "#ffffff" : "#C9CDD0", metalness: 0.6, roughness: 0.4 });
      }),
    [],
  );

  return (
    <group name={label ? `motor:${label}` : "motor"}>
      {/* stator frame core */}
      <Cyl r={R} h={L} axis="x" position={[xc, H, 0]} m="paintMotor" seg={48} />
      {/* longitudinal cooling fins */}
      <Instanced items={fins} m="paintMotor">
        <boxGeometry args={[L - 0.02, fh, 0.007]} />
      </Instanced>
      {/* fin end rings (cast) */}
      <Cyl r={R + fh * 0.55} h={0.018} axis="x" position={[x1 - 0.009, H, 0]} m="paintMotor" seg={48} />
      <Cyl r={R + fh * 0.55} h={0.018} axis="x" position={[x0 + 0.009, H, 0]} m="paintMotor" seg={48} />

      {/* feet: cast legs + slotted bolt pads */}
      {feet.map((p, i) => (
        <group key={i} position={p}>
          <mesh geometry={footGeom} material={M("paintMotor")} />
          <mesh geometry={webGeom} position={[0, 0, -Math.sign(p[2]) * 0.02]} material={M("paintMotor")} />
          <Cyl r={0.013} h={0.008} position={[0, 0.036, 0.008]} m="darkSteel" seg={6} />
        </group>
      ))}
      <Box size={[0.36, 0.05, 0.2]} position={[xc, H - R + 0.005, 0]} m="paintMotor" />

      {/* DE end shield + bearing cap + V-ring */}
      <Lathe profile={deShield} axis="x" position={[x1, H, 0]} m="paintMotor" />
      <Cyl r={0.034} h={0.008} axis="x" position={[x1 + 0.056, H, 0]} m="rubber" />
      {/* shaft with key */}
      <Cyl r={0.0275} h={MOTOR.shaftTip - x1 - 0.05} axis="x" position={[(x1 + 0.05 + MOTOR.shaftTip) / 2, H, 0]} m="steel" />
      <Box size={[0.07, 0.009, 0.014]} position={[MOTOR.shaftTip - 0.045, H + 0.027, 0]} m="steel" />
      {/* end-shield fixing bolts + bearing cap bolts */}
      <BoltHeads points={shieldBolts} axis="x" r={0.007} />
      {/* grease nipples */}
      <Cyl r={0.005} h={0.02} position={[x1 + 0.012, H + R + 0.006, 0]} m="brass" seg={8} />
      <Cyl r={0.005} h={0.02} position={[x0 - 0.012, H + R + 0.006, 0]} m="brass" seg={8} />

      {/* NDE end shield (under the cowl) */}
      <Cyl r={R + fh + 0.004} h={0.022} axis="x" position={[x0 - 0.011, H, 0]} m="paintMotor" seg={48} />
      {/* fan cowl (pressed steel) with vent grille on the end face */}
      <Lathe profile={cowl} rotation={[0, 0, Math.PI / 2]} position={[x0 - 0.018, H, 0]} m="paintMotor" seg={48} />
      <Cyl r={0.16} h={0.004} axis="x" position={[x0 - 0.018 - 0.12, H, 0]} m="gap" seg={40} />
      {/* fan hub + blades seen through the grille */}
      <Cyl r={0.035} h={0.03} axis="x" position={[x0 - 0.018 - 0.105, H, 0]} m="plasticDark" />
      {ventRings.map((r) => (
        <mesh key={r} position={[x0 - 0.018 - 0.149, H, 0]} rotation={[0, -Math.PI / 2, 0]} material={texturedMaterial("cowlRing", () => new THREE.MeshStandardMaterial({ color: "#5F6A72", roughness: 0.5, metalness: 0.12, side: THREE.DoubleSide }))}>
          <ringGeometry args={[r - 0.0055, r + 0.0055, 48]} />
        </mesh>
      ))}
      {Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2).map((a) => (
        <Box key={a} size={[0.006, 0.13, 0.009]} position={[x0 - 0.018 - 0.149, H + Math.cos(a) * 0.085, Math.sin(a) * 0.085]} rotation={[a, 0, 0]} m="paintMotor" />
      ))}
      <Cyl r={0.03} h={0.008} axis="x" position={[x0 - 0.018 - 0.149, H, 0]} m="paintMotor" />
      {/* cowl fixing screws */}
      {[0.6, 2.2, 3.8, 5.4].map((a) => (
        <Cyl key={a} r={0.006} h={0.006} axis="z" rotation={[a, 0, 0]} position={[x0 - 0.1, H + Math.cos(a) * (R + fh + 0.006), Math.sin(a) * (R + fh + 0.006)]} m="darkSteel" seg={6} />
      ))}

      {/* terminal box on top: adaptor, box, lid with screws, two glands on +Z */}
      <RBox size={[0.13, 0.03, 0.13]} radius={0.006} position={[tbX, H + R + fh - 0.01, 0]} m="paintMotor" />
      <RBox size={[0.17, 0.08, 0.16]} radius={0.01} position={[tbX, tbY, 0]} m="paintMotor" />
      <RBox size={[0.178, 0.014, 0.168]} radius={0.006} position={[tbX, tbY + 0.045, 0]} m="paintMotor" />
      {[
        [-0.075, -0.07],
        [0.075, -0.07],
        [-0.075, 0.07],
        [0.075, 0.07],
      ].map(([dx, dz]) => (
        <Cyl key={`${dx}${dz}`} r={0.006} h={0.006} position={[tbX + dx!, tbY + 0.054, dz!]} m="darkSteel" seg={6} />
      ))}
      <Gland position={[tbX - 0.035, tbY - 0.008, 0.08]} axis="z" r={0.014} tail={0.025} />
      <Gland position={[tbX + 0.045, tbY - 0.008, 0.08]} axis="z" r={0.009} tail={0.02} />

      {/* lifting eyebolt (NDE side of top) */}
      <group position={[x0 + 0.05, H + R + fh, 0]}>
        <Cyl r={0.012} h={0.02} position={[0, 0.005, 0]} m="steel" seg={16} />
        <mesh position={[0, 0.045, 0]} material={texturedMaterial("eyebolt", () => new THREE.MeshStandardMaterial({ color: "#C7CACD", metalness: 1, roughness: 0.3 }))}>
          <torusGeometry args={[0.024, 0.0065, 12, 32]} />
        </mesh>
      </group>

      {/* nameplate on a machined pad, +Z side */}
      <group position={[xc - 0.07, H + 0.035, 0]} rotation={[-0.35, 0, 0]}>
        <Box size={[0.13, 0.08, 0.02]} position={[0, 0, R + fh - 0.006]} m="paintMotor" />
        <mesh position={[0, 0, R + fh + 0.0045]} material={plate}>
          <planeGeometry args={[0.115, 0.07]} />
        </mesh>
      </group>
      {/* earth terminal */}
      <Cyl r={0.008} h={0.012} axis="z" position={[x1 - 0.03, H - 0.06, R + 0.01]} m="brass" seg={6} />
    </group>
  );
}
