/** 2D profiles for extruded castings and sheet-metal housings. */
import * as THREE from "three";

/**
 * Volute / scroll outline in the XY plane, centred on the impeller axis. The spiral opens
 * counter-clockwise from the cut-water (tongue) and discharges tangentially upwards on the +X
 * side: outlet between x = xin and x = r1, up to y = outletH.
 */
export function spiralShape({ r0, r1, outletH, tongue = 0.42, steps = 64 }: { r0: number; r1: number; outletH: number; tongue?: number; steps?: number }) {
  const s = new THREE.Shape();
  const span = Math.PI * 2 - tongue;
  const tx = r0 * Math.cos(tongue);
  const ty = r0 * Math.sin(tongue);
  s.moveTo(tx, ty);
  for (let i = 1; i <= steps; i++) {
    const phi = tongue + (span * i) / steps;
    const r = r0 + ((r1 - r0) * (phi - tongue)) / span;
    s.lineTo(r * Math.cos(phi), r * Math.sin(phi));
  }
  s.lineTo(r1, outletH);
  s.lineTo(tx, outletH);
  s.lineTo(tx, ty);
  return { shape: s, outletX: [tx, r1] as [number, number] };
}

/** Extruded spiral housing centred on its depth, extrusion along +X (impeller axis = X). */
export function spiralHousingGeometry(opts: { r0: number; r1: number; outletH: number; depth: number; bevel: number; tongue?: number }) {
  const { shape } = spiralShape(opts);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: opts.depth - opts.bevel * 2,
    bevelEnabled: true,
    bevelThickness: opts.bevel,
    bevelSize: opts.bevel,
    bevelSegments: 3,
    curveSegments: 12,
  });
  g.translate(0, 0, -(opts.depth - opts.bevel * 2) / 2);
  // shape X → world −Z, shape Y → world Y, depth (Z) → world X
  g.rotateY(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

/** Rectangle with a rectangular hole (frames, gaskets, louvre surrounds), in XY. */
export function frameShape(w: number, h: number, border: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -h / 2);
  s.lineTo(w / 2, -h / 2);
  s.lineTo(w / 2, h / 2);
  s.lineTo(-w / 2, h / 2);
  s.lineTo(-w / 2, -h / 2);
  const hole = new THREE.Path();
  const iw = w / 2 - border;
  const ih = h / 2 - border;
  hole.moveTo(-iw, -ih);
  hole.lineTo(-iw, ih);
  hole.lineTo(iw, ih);
  hole.lineTo(iw, -ih);
  hole.lineTo(-iw, -ih);
  s.holes.push(hole);
  return s;
}

/** Lipped C-channel profile (baseplates, conveyor stringers) in XY, web at x = 0 opening to +X. */
export function channelShape(h: number, flange: number, t: number) {
  const s = new THREE.Shape();
  s.moveTo(0, -h / 2);
  s.lineTo(flange, -h / 2);
  s.lineTo(flange, -h / 2 + t);
  s.lineTo(t, -h / 2 + t);
  s.lineTo(t, h / 2 - t);
  s.lineTo(flange, h / 2 - t);
  s.lineTo(flange, h / 2);
  s.lineTo(0, h / 2);
  s.lineTo(0, -h / 2);
  return s;
}
