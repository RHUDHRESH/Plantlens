/**
 * Process equipment: globe control valve with diaphragm actuator, vertical tank, shell & tube
 * heat exchanger, screw compressor package, belt conveyor, field instrument (pressure
 * transmitter on a pipe stand).
 */
import { useMemo } from "react";
import { tagPlateMaterial } from "./Cabinet";
import { InductionMotor } from "./InductionMotor";
import { ledMaterial } from "./materials";
import { BoltHeads, Box, circlePoints, Cyl, Flange, Gland, Instanced, Lathe, M, Pipe, Plate, RBox, type InstanceItem, type V3 } from "./parts";
import { guardMaterial } from "./PumpSet";
import type { ModelProps } from "./types";

function ellipticalHead(r: number, depth: number, n = 10): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * (Math.PI / 2);
    pts.push([r * Math.cos(a), depth * Math.sin(a)]);
  }
  return pts;
}

function PipeSupport({ x, y, z = 0, r }: { x: number; y: number; z?: number; r: number }) {
  return (
    <group position={[x, 0, z]}>
      <Box size={[0.16, 0.012, 0.16]} position={[0, 0.006, 0]} m="galvanised" />
      <Box size={[0.05, y - r - 0.01, 0.05]} position={[0, (y - r) / 2, 0]} m="galvanised" />
      <Box size={[0.08, 0.012, r * 2.6]} position={[0, y - r - 0.006, 0]} m="galvanised" />
    </group>
  );
}

/** Globe control valve (DN80) in a flanged spool with pneumatic diaphragm actuator + positioner. */
export function ControlValve({ ledColor, label }: ModelProps) {
  const py = 0.42;
  const r = 0.045;
  return (
    <group>
      {/* pipe spool + flanges */}
      <Pipe from={[-0.58, py, 0]} to={[-0.19, py, 0]} r={r} m="paintSilver" />
      <Pipe from={[0.19, py, 0]} to={[0.58, py, 0]} r={r} m="paintSilver" />
      {[-0.58, -0.19, 0.19, 0.58].map((x) => (
        <Flange key={x} r={0.1} t={0.022} axis="x" position={[x, py, 0]} m="paintSilver" />
      ))}
      <PipeSupport x={-0.42} y={py} r={r} />
      <PipeSupport x={0.42} y={py} r={r} />
      {/* globe body */}
      <Lathe profile={[[0.0, -0.13], [0.07, -0.12], [0.115, -0.07], [0.125, 0], [0.11, 0.07], [0.07, 0.11], [0.06, 0.12], [0, 0.12]]} m="castIron" position={[0, py, 0]} seg={40} />
      <Cyl r={0.07} h={0.3} axis="x" position={[0, py, 0]} m="castIron" />
      {/* bonnet with flange */}
      <Cyl r={0.1} h={0.03} position={[0, py + 0.13, 0]} m="castIron" />
      <BoltHeads points={circlePoints("y", 0.085, 8, py + 0.15)} r={0.009} />
      <Cyl r={0.045} r2={0.035} h={0.2} position={[0, py + 0.24, 0]} m="castIron" />
      <Cyl r={0.05} h={0.03} position={[0, py + 0.35, 0]} m="castIron" />
      {/* yoke + stem + travel indicator */}
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.03, 0.26, 0.04]} position={[s * 0.07, py + 0.49, 0]} m="paintMotor" />
      ))}
      <Box size={[0.18, 0.03, 0.06]} position={[0, py + 0.62, 0]} m="paintMotor" />
      <Cyl r={0.009} h={0.26} position={[0, py + 0.49, 0]} m="steel" />
      <Box size={[0.05, 0.02, 0.03]} position={[0, py + 0.47, 0]} m="steel" />
      <Box size={[0.006, 0.12, 0.03]} position={[0.058, py + 0.5, 0.02]} m="aluminium" />
      {/* diaphragm actuator: two pressed domes with bolted rim */}
      <group position={[0, py + 0.64, 0]}>
        <Lathe profile={[[0.03, 0], [0.12, 0.02], [0.2, 0.07], [0.215, 0.1], [0.215, 0.105]]} m="paintMotor" seg={48} />
        <Cyl r={0.232} h={0.018} position={[0, 0.114, 0]} m="paintMotor" seg={48} />
        <BoltHeads points={circlePoints("y", 0.222, 20, 0.126)} r={0.007} />
        <Lathe profile={[[0.215, 0.123], [0.215, 0.13], [0.2, 0.16], [0.12, 0.2], [0.04, 0.215], [0, 0.215]]} m="paintMotor" seg={48} />
        <Cyl r={0.018} h={0.03} position={[0, 0.225, 0]} m="brass" seg={12} />
      </group>
      {/* positioner on the yoke + air tubing */}
      <group position={[0.14, py + 0.5, 0.02]}>
        <RBox size={[0.1, 0.14, 0.09]} radius={0.01} m="aluminiumBrushed" />
        <Cyl r={0.022} h={0.012} axis="z" position={[0, 0.03, 0.05]} m="plasticDark" />
        <Box size={[0.05, 0.005, 0.003]} position={[0, -0.03, 0.046]} m={ledColor ? ledMaterial(ledColor) : "ledOff"} />
        {[-0.025, 0.025].map((x) => (
          <group key={x} position={[x, -0.085, 0.02]}>
            <Cyl r={0.018} h={0.012} axis="z" m="stainless" />
            <Cyl r={0.015} h={0.004} axis="z" position={[0, 0, 0.008]} m="sightGlass" />
          </group>
        ))}
        <Gland position={[0, 0.07, 0]} r={0.008} tail={0.06} />
      </group>
      <Pipe from={[0.19, py + 0.57, 0.02]} to={[0.19, py + 0.7, 0.02]} r={0.004} m="copper" />
      <Pipe from={[0.19, py + 0.7, 0.02]} to={[0.12, py + 0.7, 0.02]} r={0.004} m="copper" />
      {label ? <Plate size={[0.1, 0.025]} position={[0, py + 0.49, 0.022]} material={tagPlateMaterial(label)} /> : null}
    </group>
  );
}

/** Vertical process tank on legs: elliptical heads, nozzles, manway, level gauge, caged ladder,
 * top handrail. Stainless shell. */
export function Tank({ ledColor, label }: ModelProps) {
  const R = 0.65;
  const legH = 0.45;
  const shellH = 1.95;
  const s0 = legH + 0.16;
  const s1 = s0 + shellH;
  const rungs = useMemo<InstanceItem[]>(() => Array.from({ length: Math.floor((s1 + 0.3) / 0.3) }, (_, i) => ({ p: [0, 0.25 + i * 0.3, 0] as V3, r: [0, 0, Math.PI / 2] as V3 })), [s1]);
  const railPosts = useMemo<InstanceItem[]>(() => circlePoints("y", R - 0.08, 10, s1 + 0.5).map((p) => ({ p })), [s1]);
  return (
    <group>
      {/* legs with base plates, reinforcing pads */}
      {[0, 1, 2, 3].map((i) => {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        const x = Math.cos(a) * (R - 0.02);
        const z = Math.sin(a) * (R - 0.02);
        return (
          <group key={i} position={[x, 0, z]}>
            <Box size={[0.2, 0.014, 0.2]} position={[0, 0.007, 0]} m="stainless" />
            <Cyl r={0.045} h={s0 + 0.2} position={[0, (s0 + 0.2) / 2, 0]} m="stainless" seg={20} />
          </group>
        );
      })}
      {/* shell + heads + girth seam */}
      <Cyl r={R} h={shellH} position={[0, (s0 + s1) / 2, 0]} m="stainless" seg={64} />
      <Lathe profile={ellipticalHead(R, 0.2)} position={[0, s1, 0]} m="stainless" seg={64} />
      <Lathe profile={ellipticalHead(R, 0.2)} position={[0, s0, 0]} rotation={[Math.PI, 0, 0]} m="stainless" seg={64} />
      <Cyl r={R + 0.004} h={0.012} position={[0, s0 + shellH * 0.5, 0]} m="stainless" seg={64} />
      {/* top nozzles */}
      {[[0.25, 0.1], [-0.25, -0.15], [0, 0]].map(([x, z], i) => (
        <group key={i} position={[x!, s1 + 0.14, z!]}>
          <Cyl r={i === 2 ? 0.08 : 0.045} h={0.18} position={[0, 0.06, 0]} m="stainless" />
          <Flange r={i === 2 ? 0.15 : 0.09} t={0.02} axis="y" position={[0, 0.16, 0]} m="stainless" />
        </group>
      ))}
      {/* side inlet (upper) + outlet (lower) */}
      <Pipe from={[0, s1 - 0.3, R - 0.05]} to={[0, s1 - 0.3, R + 0.18]} r={0.045} m="stainless" />
      <Flange r={0.1} t={0.02} axis="z" position={[0, s1 - 0.3, R + 0.19]} m="stainless" />
      <Pipe from={[0, s0 - 0.12, 0]} to={[0, s0 - 0.12, R + 0.25]} r={0.045} m="stainless" />
      <Flange r={0.1} t={0.02} axis="z" position={[0, s0 - 0.12, R + 0.26]} m="stainless" />
      {/* manway */}
      <group position={[-R * 0.707, s0 + 0.55, R * 0.707]} rotation={[0, -Math.PI / 4, 0]}>
        <Cyl r={0.24} h={0.14} axis="z" position={[0, 0, 0.04]} m="stainless" />
        <Flange r={0.3} t={0.03} axis="z" position={[0, 0, 0.12]} m="stainless" />
        <Cyl r={0.3} h={0.03} axis="z" position={[0, 0, 0.15]} m="stainless" />
        <Box size={[0.12, 0.02, 0.03]} position={[0, 0, 0.18]} m="stainless" />
      </group>
      {/* level gauge (magnetic type) */}
      <group position={[R * 0.707 + 0.14, 0, R * 0.707 + 0.14]}>
        <Cyl r={0.032} h={shellH - 0.2} position={[0, (s0 + s1) / 2, 0]} m="stainless" />
        <Box size={[0.03, shellH - 0.3, 0.012]} position={[0.0, (s0 + s1) / 2, 0.033]} m="plasticGrey" />
        <Box size={[0.034, 0.014, 0.016]} position={[0.0, s0 + shellH * 0.62, 0.035]} m={ledColor ? ledMaterial(ledColor, 0.9) : "plasticDark"} />
        {[s0 + 0.2, s1 - 0.2].map((y) => (
          <Pipe key={y} from={[0, y, 0]} to={[-0.13, y, -0.13]} r={0.018} m="stainless" />
        ))}
      </group>
      {/* fixed ladder (+X side) with wall brackets */}
      <group position={[R + 0.14, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        {[-0.22, 0.22].map((x) => (
          <Box key={x} size={[0.05, s1 + 0.9, 0.012]} position={[x, (s1 + 0.9) / 2, 0]} m="galvanised" />
        ))}
        <Instanced items={rungs} m="galvanised">
          <cylinderGeometry args={[0.012, 0.012, 0.44, 8]} />
        </Instanced>
        {[0.6, 1.6, s1 - 0.2].map((y) => (
          <Box key={y} size={[0.04, 0.03, 0.16]} position={[0, y, -0.08]} m="galvanised" />
        ))}

      </group>
      {/* top handrail */}
      <Instanced items={railPosts} m="galvanised">
        <cylinderGeometry args={[0.014, 0.014, 0.9, 8]} />
      </Instanced>
      {[s1 + 0.93, s1 + 0.55].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={M("galvanised")}>
          <torusGeometry args={[R - 0.08, 0.016, 8, 48]} />
        </mesh>
      ))}
      {label ? <Plate size={[0.2, 0.05]} position={[0, s0 + 1.4, R + 0.002]} material={tagPlateMaterial(label)} /> : null}
    </group>
  );
}

/** Shell & tube heat exchanger (BEM type): shell on saddles, channel bonnet with girth flanges,
 * shell- and tube-side nozzles. */
export function HeatExchanger({ ledColor, label }: ModelProps) {
  const cy = 0.62;
  const R = 0.26;
  const x0 = -1.2;
  const x1 = 0.9;
  return (
    <group>
      {/* saddles */}
      {[-0.75, 0.55].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <Box size={[0.22, 0.016, 0.62]} position={[0, 0.008, 0]} m="paintBase" />
          <Box size={[0.016, cy - 0.12, 0.56]} position={[0, (cy - 0.12) / 2, 0]} m="paintBase" />
          {[-0.22, 0.22].map((z) => (
            <Box key={z} size={[0.18, cy - 0.12, 0.014]} position={[0, (cy - 0.12) / 2, z]} m="paintBase" />
          ))}
          <Cyl r={R + 0.012} h={0.2} axis="x" position={[0, cy, 0]} m="paintBase" thetaStart={Math.PI * 0.62} thetaLength={Math.PI * 0.76} open />
        </group>
      ))}
      {/* shell + rear dished head */}
      <Cyl r={R} h={x1 - x0} axis="x" position={[(x0 + x1) / 2, cy, 0]} m="paintBase" seg={48} />
      <Lathe profile={ellipticalHead(R, 0.12)} rotation={[0, 0, Math.PI / 2]} position={[x0, cy, 0]} m="paintBase" />
      {/* girth flanges + channel + bonnet */}
      <Flange r={R + 0.07} t={0.04} axis="x" position={[x1 + 0.02, cy, 0]} bolts={20} m="paintBase" />
      <Flange r={R + 0.07} t={0.04} axis="x" position={[x1 + 0.065, cy, 0]} bolts={20} m="paintBase" />
      <Cyl r={R} h={0.3} axis="x" position={[x1 + 0.235, cy, 0]} m="paintBase" seg={48} />
      <Flange r={R + 0.07} t={0.04} axis="x" position={[x1 + 0.4, cy, 0]} bolts={20} m="paintBase" />
      <Lathe profile={ellipticalHead(R + 0.02, 0.14)} rotation={[0, 0, -Math.PI / 2]} position={[x1 + 0.42, cy, 0]} m="paintBase" />
      {/* nozzles: shell side top/bottom, tube side top/front */}
      {[
        { at: [x0 + 0.35, cy + R, 0] as V3, dir: "y" as const, len: 0.18 },
        { at: [x1 - 0.3, cy - R, 0] as V3, dir: "-y" as const, len: 0.14 },
        { at: [x1 + 0.235, cy + R, 0] as V3, dir: "y" as const, len: 0.18 },
        { at: [x1 + 0.235, cy, R] as V3, dir: "z" as const, len: 0.18 },
      ].map((n, i) => {
        const end: V3 = n.dir === "y" ? [n.at[0], n.at[1] + n.len, n.at[2]] : n.dir === "-y" ? [n.at[0], n.at[1] - n.len, n.at[2]] : [n.at[0], n.at[1], n.at[2] + n.len];
        const start: V3 = n.dir === "z" ? [n.at[0], n.at[1], n.at[2] - 0.05] : [n.at[0], n.at[1] + (n.dir === "y" ? -0.05 : 0.05), n.at[2]];
        return (
          <group key={i}>
            <Pipe from={start} to={end} r={0.055} m="paintBase" />
            <Flange r={0.11} t={0.022} axis={n.dir === "z" ? "z" : "y"} position={end} m="paintBase" />
          </group>
        );
      })}
      {/* nameplate bracket + temperature gauge */}
      {label ? <Plate size={[0.18, 0.045]} position={[-0.2, cy, R + 0.003]} material={tagPlateMaterial(label)} /> : null}
      <group position={[x1 - 0.6, cy + R + 0.08, 0]}>
        <Cyl r={0.012} h={0.08} position={[0, -0.04, 0]} m="stainless" />
        <Cyl r={0.05} h={0.03} axis="z" position={[0, 0.03, 0]} m="stainless" />
        <Cyl r={0.043} h={0.004} axis="z" position={[0, 0.03, 0.016]} m={ledColor ? ledMaterial(ledColor, 0.8) : "plasticGrey"} />
      </group>
    </group>
  );
}

/** Open-frame oil-injected screw compressor package: skid, motor, airend with inlet valve and
 * filter, oil separator vessel, aftercooler with fan, controller. */
export function ScrewCompressor({ ledColor, label }: ModelProps) {
  const coolerFins = useMemo<InstanceItem[]>(() => Array.from({ length: 36 }, (_, i) => ({ p: [0, 0, -0.33 + i * 0.019] })), []);
  const guard = guardMaterial("fan", [6, 6]);
  return (
    <group>
      {/* skid */}
      {[-0.46, 0.46].map((z) => (
        <RBox key={z} size={[2.0, 0.12, 0.08]} radius={0.004} position={[0, 0.06, z]} m="paintDark" />
      ))}
      <Box size={[1.96, 0.012, 0.9]} position={[0, 0.126, 0]} m="paintDark" />
      {/* motor → airend */}
      <group position={[0.22, 0.13, -0.05]} scale={1.2}>
        <InductionMotor />
      </group>
      <group position={[0.82, 0, -0.05]}>
        <Box size={[0.2, 0.22, 0.24]} position={[0, 0.24, 0]} m="paintCasting" />
        <RBox size={[0.3, 0.26, 0.28]} radius={0.04} position={[0.02, 0.43, 0]} m="castIron" />
        <Cyl r={0.12} h={0.3} axis="x" position={[0.02, 0.5, 0.05]} m="castIron" />
        <Cyl r={0.1} h={0.3} axis="x" position={[0.02, 0.4, -0.07]} m="castIron" />
        {/* inlet valve + air filter */}
        <Cyl r={0.07} h={0.12} position={[0.02, 0.62, 0]} m="aluminium" />
        <Cyl r={0.13} h={0.3} position={[0.02, 0.83, 0]} m="paintDark" seg={40} />
        <Cyl r={0.135} h={0.03} position={[0.02, 0.99, 0]} m="paintDark" seg={40} />
      </group>
      {/* oil separator vessel */}
      <group position={[-0.55, 0.13, 0.22]}>
        <Cyl r={0.18} h={0.75} position={[0, 0.5, 0]} m="paintBase" seg={40} />
        <Lathe profile={ellipticalHead(0.18, 0.08)} position={[0, 0.875, 0]} m="paintBase" />
        <Box size={[0.12, 0.12, 0.12]} position={[0, 0.06, 0]} m="paintDark" />
        <Flange r={0.2} t={0.03} axis="y" position={[0, 0.9, 0]} m="paintBase" />
        <Cyl r={0.03} h={0.12} position={[0.08, 1.0, 0]} m="brass" />
        <Cyl r={0.045} h={0.02} axis="z" position={[0, 0.5, 0.18]} m="sightGlass" />
      </group>
      <Pipe from={[0.84, 0.5, 0.1]} to={[0.84, 0.5, 0.22]} r={0.03} m="darkSteel" />
      <Pipe from={[0.84, 0.5, 0.22]} to={[-0.37, 0.5, 0.22]} r={0.03} m="darkSteel" />
      {/* aftercooler + fan */}
      <group position={[-0.72, 0.13, -0.18]}>
        <Box size={[0.08, 1.0, 0.72]} position={[0, 0.62, 0]} m="paintDark" />
        <group position={[0.05, 0.62, 0]}>
          <Instanced items={coolerFins} m="aluminium">
            <boxGeometry args={[0.03, 0.92, 0.004]} />
          </Instanced>
        </group>
        <Cyl r={0.36} h={0.12} axis="x" position={[0.14, 0.62, 0]} m="paintDark" seg={48} open />
        <mesh position={[0.2, 0.62, 0]} rotation={[0, Math.PI / 2, 0]} material={guard}>
          <circleGeometry args={[0.36, 40]} />
        </mesh>
      </group>
      {/* controller */}
      <group position={[0.85, 0.13, 0.4]}>
        <Box size={[0.05, 0.9, 0.05]} position={[0, 0.45, -0.03]} m="paintDark" />
        <RBox size={[0.36, 0.3, 0.14]} radius={0.01} position={[0, 1.05, 0.02]} m="paintLight" />
        <Box size={[0.14, 0.09, 0.004]} position={[-0.05, 1.08, 0.092]} m="lcd" />
        <Box size={[0.08, 0.006, 0.004]} position={[0.1, 1.0, 0.092]} m={ledColor ? ledMaterial(ledColor) : "ledOff"} />
        <Cyl r={0.02} h={0.02} axis="z" position={[0.12, 1.1, 0.1]} m="plasticBlack" />
      </group>
      {label ? <Plate size={[0.16, 0.04]} position={[0, 0.07, 0.502]} material={tagPlateMaterial(label)} /> : null}
    </group>
  );
}

/** Belt conveyor: channel stringers on leg frames, carrying and return idlers (instanced), head
 * and tail pulleys with belt wrap, gear-motor drive at the head with guard. */
export function Conveyor({ running, ledColor, label }: ModelProps) {
  const L = 3.6;
  const bw = 0.65;
  const top = 0.9;
  const carry = useMemo<InstanceItem[]>(() => Array.from({ length: Math.floor(L / 0.3) }, (_, i) => ({ p: [-L / 2 + 0.25 + i * 0.3, top - 0.07, 0], r: [Math.PI / 2, 0, 0] })), []);
  const ret = useMemo<InstanceItem[]>(() => Array.from({ length: 3 }, (_, i) => ({ p: [-L / 2 + 0.6 + i * 1.2, 0.46, 0], r: [Math.PI / 2, 0, 0] })), []);
  const legs = [-L / 2 + 0.25, -0.4, 0.6, L / 2 - 0.25];
  return (
    <group>
      {/* stringers */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Box size={[L + 0.1, 0.12, 0.012]} position={[0, top - 0.1, s * (bw / 2 + 0.07)]} m="paintDark" />
          <Box size={[L + 0.1, 0.012, 0.05]} position={[0, top - 0.04, s * (bw / 2 + 0.05)]} m="paintDark" />
          <Box size={[L + 0.1, 0.012, 0.05]} position={[0, top - 0.16, s * (bw / 2 + 0.05)]} m="paintDark" />
        </group>
      ))}
      {/* leg frames with cross brace + feet */}
      {legs.map((x) => (
        <group key={x} position={[x, 0, 0]}>
          {[-1, 1].map((s) => (
            <group key={s}>
              <Box size={[0.05, top - 0.16, 0.05]} position={[0, (top - 0.16) / 2, s * (bw / 2 + 0.07)]} m="paintDark" />
              <Box size={[0.12, 0.012, 0.12]} position={[0, 0.006, s * (bw / 2 + 0.07)]} m="paintDark" />
            </group>
          ))}
          <Box size={[0.04, 0.04, bw + 0.14]} position={[0, 0.3, 0]} m="paintDark" />
        </group>
      ))}
      {/* idlers */}
      <Instanced items={carry} m="steel">
        <cylinderGeometry args={[0.045, 0.045, bw + 0.04, 20]} />
      </Instanced>
      <Instanced items={ret} m="steel">
        <cylinderGeometry args={[0.04, 0.04, bw + 0.04, 20]} />
      </Instanced>
      {/* pulleys */}
      <Cyl r={0.12} h={bw + 0.06} axis="z" position={[L / 2 - 0.05, top - 0.13, 0]} m="paintMotor" seg={40} />
      <Cyl r={0.1} h={bw + 0.06} axis="z" position={[-L / 2 + 0.05, top - 0.11, 0]} m="paintMotor" seg={40} />
      {/* belt: carry run, return run, wraps */}
      <Box size={[L - 0.1, 0.012, bw]} position={[0, top - 0.018, 0]} m="rubber" />
      <Box size={[L - 0.1, 0.012, bw]} position={[0, 0.405, 0]} m="rubber" />
      <Cyl r={0.132} h={bw} axis="z" position={[L / 2 - 0.05, top - 0.13, 0]} m="rubber" seg={40} thetaStart={0} thetaLength={Math.PI} open />
      <Cyl r={0.112} h={bw} axis="z" position={[-L / 2 + 0.05, top - 0.11, 0]} m="rubber" seg={40} thetaStart={Math.PI} thetaLength={Math.PI} open />
      {/* drive: gearbox + motor on the head pulley shaft, +Z side */}
      <group position={[L / 2 - 0.05, top - 0.13, bw / 2 + 0.12]}>
        <Cyl r={0.025} h={0.1} axis="z" position={[0, 0, -0.04]} m="steel" />
        <RBox size={[0.26, 0.24, 0.16]} radius={0.03} position={[0, 0, 0.08]} m="paintMotor" />
        <group position={[0.02, -0.2, 0.22]} rotation={[0, Math.PI / 2, 0]} scale={0.55}>
          <InductionMotor running={running ?? false} />
        </group>
      </group>
      {/* head pulley guard */}
      <mesh position={[L / 2 - 0.05, top - 0.13, -(bw / 2 + 0.1)]} material={guardMaterial("conveyor", [6, 6])}>
        <circleGeometry args={[0.2, 32]} />
      </mesh>
      {/* pull-wire emergency stop switch */}
      <group position={[0, top - 0.02, bw / 2 + 0.1]}>
        <RBox size={[0.1, 0.12, 0.08]} radius={0.008} m="plasticGrey" />
        <Box size={[0.06, 0.005, 0.004]} position={[0, -0.03, 0.041]} m={ledColor ? ledMaterial(ledColor) : "ledOff"} />
      </group>
      <Pipe from={[-L / 2 + 0.1, top + 0.02, bw / 2 + 0.1]} to={[L / 2 - 0.3, top + 0.02, bw / 2 + 0.1]} r={0.003} m="steel" />
      {label ? <Plate size={[0.14, 0.035]} position={[-L / 4, top - 0.1, bw / 2 + 0.077]} material={tagPlateMaterial(label)} /> : null}
    </group>
  );
}

/** Pressure transmitter (dual-compartment housing, coplanar flange, 3-valve manifold) on a 2" pipe stand. */
export function Instrument({ ledColor, label }: ModelProps) {
  const top = 1.15;
  return (
    <group>
      <Box size={[0.24, 0.012, 0.24]} position={[0, 0.006, 0]} m="galvanised" />
      <BoltHeads points={[[-0.09, 0.016, -0.09], [0.09, 0.016, -0.09], [-0.09, 0.016, 0.09], [0.09, 0.016, 0.09]]} r={0.01} />
      <Cyl r={0.03} h={top} position={[0, top / 2, 0]} m="galvanised" seg={20} />
      <Cyl r={0.034} h={0.02} position={[0, top, 0]} m="galvanised" seg={20} />
      {/* U-bolt bracket */}
      <Box size={[0.1, 0.12, 0.006]} position={[0, top - 0.12, 0.04]} m="stainless" />
      {/* manifold + coplanar flange */}
      <RBox size={[0.09, 0.05, 0.08]} radius={0.006} position={[0, top - 0.16, 0.09]} m="stainless" />
      {[-0.035, 0, 0.035].map((x) => (
        <Cyl key={x} r={0.006} h={0.04} position={[x, top - 0.12, 0.09]} m="stainless" seg={8} />
      ))}
      <RBox size={[0.08, 0.04, 0.07]} radius={0.004} position={[0, top - 0.115, 0.09]} m="stainless" />
      {/* transmitter body: dual compartment along Z */}
      <group position={[0, top - 0.03, 0.09]}>
        <Cyl r={0.018} h={0.05} position={[0, -0.03, 0]} m="stainless" />
        <Cyl r={0.05} h={0.12} axis="z" position={[0, 0.03, 0]} m="paintMotor" />
        <Cyl r={0.054} h={0.02} axis="z" position={[0, 0.03, 0.07]} m="paintMotor" />
        <Cyl r={0.04} h={0.004} axis="z" position={[0, 0.03, 0.081]} m="sightGlass" />
        <Cyl r={0.036} h={0.002} axis="z" position={[0, 0.03, 0.078]} m={ledColor ? ledMaterial(ledColor, 0.6) : "lcd"} />
        <Cyl r={0.054} h={0.02} axis="z" position={[0, 0.03, -0.07]} m="paintMotor" />
        <Gland position={[0.05, 0.03, 0]} axis="x" r={0.009} tail={0.08} />
      </group>
      <Pipe from={[0, top - 0.19, 0.09]} to={[0, 0.25, 0.09]} r={0.006} m="stainless" />
      {label ? <Plate size={[0.08, 0.02]} position={[0, top - 0.12, 0.0435]} material={tagPlateMaterial(label)} /> : null}
    </group>
  );
}
