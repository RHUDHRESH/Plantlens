/** Cabinet-based equipment: drive (VFD/inverter), PLC, DC distribution, generic wall enclosure. */
import { Cabinet, PanelInterior } from "./Cabinet";
import { Box, RBox } from "./parts";
import type { ModelProps } from "./types";

/** Floor-standing drive cabinet 600×500×2000 on a 100 mm plinth. */
export function VfdCabinet({ running, ledColor, label }: ModelProps) {
  // Decorative display: state word + tag only. Never fake process values on a 3D model.
  const lines = [ledColor ? "FAULT" : running ? "RUN" : "READY", label ?? "", ""];
  return (
    <Cabinet w={0.6} h={2.0} d={0.5} filterFans keypad={{ lines }} ledColor={ledColor} label={label ?? "DRIVE"} topGlands={3} sideLouvres />
  );
}

/** PLC / control cabinet 800×500×2000 with glazed door showing the DIN-rail layout. */
export function PlcCabinet({ ledColor, label }: ModelProps) {
  return (
    <Cabinet w={0.8} h={2.0} d={0.5} glazed interior={<PanelInterior w={0.8} h={2.0} variant="plc" />} ledColor={ledColor} label={label ?? "PLC"} topGlands={4} />
  );
}

/** DC distribution board: busbars behind a polycarbonate shroud, row of DC MCBs, glazed door. */
export function DcDistribution({ ledColor, label }: ModelProps) {
  return (
    <Cabinet w={0.8} h={1.8} d={0.4} glazed interior={<PanelInterior w={0.8} h={1.8} variant="dc" />} ledColor={ledColor} label={label ?? "DC BUS"} topGlands={2} />
  );
}

/** Unistrut stand (two galvanised posts on base plates, cross rails). */
export function StrutStand({ width, height, depthOffset = -0.05 }: { width: number; height: number; depthOffset?: number }) {
  return (
    <group>
      {[-width / 2, width / 2].map((x) => (
        <group key={x} position={[x, 0, depthOffset]}>
          <Box size={[0.041, height, 0.041]} position={[0, height / 2, 0]} m="galvanised" />
          <Box size={[0.012, height, 0.022]} position={[0, height / 2, 0.018]} m="gap" />
          <Box size={[0.14, 0.012, 0.14]} position={[0, 0.006, 0]} m="galvanised" />
        </group>
      ))}
      {[0.4, height - 0.12].map((y) => (
        <Box key={y} size={[width + 0.041, 0.041, 0.041]} position={[0, y, depthOffset]} m="galvanised" />
      ))}
    </group>
  );
}

/** Generic wall enclosure 500×600×250 on a strut stand. */
export function GenericEnclosure({ ledColor, label }: ModelProps) {
  return (
    <group>
      <StrutStand width={0.46} height={1.5} depthOffset={-0.16} />
      <group position={[0, 0.82, 0.0]}>
        <Cabinet w={0.5} h={0.6} d={0.25} plinth={0} ledColor={ledColor} label={label ?? "JB"} topGlands={0} />
        {/* bottom gland plate */}
        <RBox size={[0.4, 0.012, 0.18]} radius={0.003} position={[0, -0.006, -0.01]} m="paintLight" />
      </group>
    </group>
  );
}
