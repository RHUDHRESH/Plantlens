/**
 * Equipment symbol GEOMETRY — plain data on a 48×48 grid, no JSX and no imports.
 *
 * Both the React renderer (./library.tsx) and the static SVG generator
 * (packages/icons/build-svg.mjs, run by plain Node with type stripping) consume this module, so the
 * app, the docs and the gallery always draw the same shapes. Keep it import-free and use only
 * erasable TypeScript syntax (no enums / namespaces / parameter properties).
 *
 * Drawing rules
 *  - Live area 4…44; main bodies are a Ø28 circle or a 28×28 box so every glyph carries equal
 *    optical weight. Leads/stubs may reach the 4 / 44 edges.
 *  - One stroke weight (1.6 px non-scaling, from CSS). `heavy` is reserved for plates/handles.
 *  - Paint roles (never colours):
 *      line    – outline only
 *      body    – main body: outline + fill; filled darker when state="running"
 *      surface – outline + neutral equipment fill (masks lines behind it), independent of state
 *      solid   – filled with the stroke ink (arrowheads, contacts, plates)
 *      hub     – running indicator: solid ink when running, neutral fill otherwise
 *  - Fixed lettering (M, S, ~, =, +, −) is drawn as stroked paths so it is font-independent;
 *    only the ISA-5.1 instrument letters (sensor `tag`) use text.
 */

export const SYMBOL_KINDS = [
  "motor",
  "dc_motor",
  "pump_centrifugal",
  "pump_pd",
  "fan",
  "blower",
  "compressor",
  "vfd",
  "inverter",
  "transformer",
  "breaker",
  "contactor",
  "fuse",
  "disconnect",
  "busbar",
  "pv_array",
  "charge_controller",
  "battery",
  "power_supply",
  "dc_dc_converter",
  "valve_control",
  "valve_onoff",
  "valve_solenoid",
  "valve_check",
  "valve_relief",
  "tank",
  "heat_exchanger",
  "boiler",
  "filter",
  "conveyor",
  "coupling",
  "bearing",
  "duct",
  "pipe",
  "lamp",
  "plc",
  "plc_io",
  "hmi",
  "sensor",
  "generic",
] as const;

export type SymbolKindName = (typeof SYMBOL_KINDS)[number];

export type SymbolCategory = "electrical" | "rotating" | "process" | "control" | "instrument" | "structural";

export interface SymbolMetaEntry {
  label: string;
  category: SymbolCategory;
}

export const SYMBOL_META: Record<SymbolKindName, SymbolMetaEntry> = {
  motor: { label: "AC motor", category: "rotating" },
  dc_motor: { label: "DC motor", category: "rotating" },
  pump_centrifugal: { label: "Centrifugal pump", category: "rotating" },
  pump_pd: { label: "Positive-displacement pump", category: "rotating" },
  fan: { label: "Fan", category: "rotating" },
  blower: { label: "Blower", category: "rotating" },
  compressor: { label: "Compressor", category: "rotating" },
  vfd: { label: "Variable-frequency drive", category: "electrical" },
  inverter: { label: "Inverter", category: "electrical" },
  transformer: { label: "Transformer", category: "electrical" },
  breaker: { label: "Circuit breaker", category: "electrical" },
  contactor: { label: "Contactor", category: "electrical" },
  fuse: { label: "Fuse", category: "electrical" },
  disconnect: { label: "Disconnect switch", category: "electrical" },
  busbar: { label: "Busbar", category: "electrical" },
  pv_array: { label: "PV array", category: "electrical" },
  charge_controller: { label: "Charge controller (MPPT)", category: "electrical" },
  battery: { label: "Battery", category: "electrical" },
  power_supply: { label: "Power supply", category: "electrical" },
  dc_dc_converter: { label: "DC/DC converter", category: "electrical" },
  valve_control: { label: "Control valve", category: "process" },
  valve_onoff: { label: "On/off valve", category: "process" },
  valve_solenoid: { label: "Solenoid valve", category: "process" },
  valve_check: { label: "Check valve", category: "process" },
  valve_relief: { label: "Relief valve", category: "process" },
  tank: { label: "Tank", category: "process" },
  heat_exchanger: { label: "Heat exchanger", category: "process" },
  boiler: { label: "Boiler", category: "process" },
  filter: { label: "Filter", category: "process" },
  conveyor: { label: "Conveyor", category: "rotating" },
  coupling: { label: "Coupling", category: "structural" },
  bearing: { label: "Bearing", category: "structural" },
  duct: { label: "Duct", category: "structural" },
  pipe: { label: "Pipe", category: "structural" },
  lamp: { label: "Lamp", category: "electrical" },
  plc: { label: "PLC", category: "control" },
  plc_io: { label: "PLC I/O module", category: "control" },
  hmi: { label: "HMI panel", category: "control" },
  sensor: { label: "Instrument", category: "instrument" },
  generic: { label: "Equipment", category: "structural" },
};

// ---- Primitive descriptors ------------------------------------------------------------------

export type SymbolPaint = "line" | "body" | "surface" | "solid" | "hub";

export interface SymbolPrimStyle {
  paint?: SymbolPaint;
  /** Dashed stroke (instrument/mechanical links, filter media, level line). */
  dash?: boolean;
  /** Heavier stroke — battery plates, handles. */
  heavy?: boolean;
  /** Only drawn when state === "running" (e.g. lamp rays). */
  when?: "running";
}

export type SymbolPrim =
  | (SymbolPrimStyle & { t: "circle"; cx: number; cy: number; r: number })
  | (SymbolPrimStyle & { t: "ellipse"; cx: number; cy: number; rx: number; ry: number })
  | (SymbolPrimStyle & { t: "rect"; x: number; y: number; w: number; h: number; rx?: number })
  | (SymbolPrimStyle & { t: "path"; d: string })
  | { t: "text"; x: number; y: number; text: string; size: "md" | "sm" | "xs" }
  | { t: "g"; transform: string; children: SymbolPrim[] };

export type SensorMounting = "field" | "panel";

export interface SymbolGeometryOptions {
  tag?: string | undefined;
  mounting?: SensorMounting | undefined;
  /** Rendered size in px; instrument letters grow below 32 px so they stay legible. */
  size?: number | undefined;
}

// ---- Helpers --------------------------------------------------------------------------------

const n = (v: number) => String(Math.round(v * 100) / 100);

const circle = (cx: number, cy: number, r: number, paint: SymbolPaint = "line", extra: SymbolPrimStyle = {}): SymbolPrim => ({
  t: "circle", cx, cy, r, paint, ...extra,
});
const rect = (x: number, y: number, w: number, h: number, rx: number, paint: SymbolPaint = "line", extra: SymbolPrimStyle = {}): SymbolPrim => ({
  t: "rect", x, y, w, h, rx, paint, ...extra,
});
const path = (d: string, paint: SymbolPaint = "line", extra: SymbolPrimStyle = {}): SymbolPrim => ({ t: "path", d, paint, ...extra });

/** Stroke-font glyphs (font-independent lettering). */
const glyph = {
  M(cx: number, cy: number, h: number): string {
    const w = h * 0.86;
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
    return `M${n(x0)} ${n(y1)}V${n(y0)}L${n(cx)} ${n(cy + h * 0.16)}L${n(x1)} ${n(y0)}V${n(y1)}`;
  },
  S(cx: number, cy: number, h: number): string {
    const w = h * 0.66;
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
    return (
      `M${n(x1)} ${n(y0 + h * 0.16)}` +
      `C${n(x1 - w * 0.2)} ${n(y0 - h * 0.02)} ${n(x0 - w * 0.02)} ${n(y0)} ${n(x0)} ${n(y0 + h * 0.25)}` +
      `C${n(x0 + w * 0.02)} ${n(cy - h * 0.02)} ${n(x1 - w * 0.02)} ${n(cy + h * 0.02)} ${n(x1)} ${n(y1 - h * 0.25)}` +
      `C${n(x1)} ${n(y1)} ${n(x0 + w * 0.2)} ${n(y1 + h * 0.02)} ${n(x0)} ${n(y1 - h * 0.16)}`
    );
  },
  tilde(cx: number, cy: number, w: number, a = w * 0.3): string {
    const x0 = cx - w / 2, x1 = cx + w / 2;
    return `M${n(x0)} ${n(cy + a * 0.35)}C${n(x0 + w * 0.42)} ${n(cy - a * 1.6)} ${n(x1 - w * 0.42)} ${n(cy + a * 1.6)} ${n(x1)} ${n(cy - a * 0.35)}`;
  },
  equals(cx: number, cy: number, w: number, gap = 3): string {
    const x0 = cx - w / 2, x1 = cx + w / 2;
    return `M${n(x0)} ${n(cy - gap / 2)}H${n(x1)}M${n(x0)} ${n(cy + gap / 2)}H${n(x1)}`;
  },
  plus(cx: number, cy: number, s: number): string {
    return `M${n(cx - s)} ${n(cy)}H${n(cx + s)}M${n(cx)} ${n(cy - s)}V${n(cy + s)}`;
  },
  minus(cx: number, cy: number, s: number): string {
    return `M${n(cx - s)} ${n(cy)}H${n(cx + s)}`;
  },
};

/** Solid arrowhead pointing along angle (deg, 0 = +x) with its tip at (x, y). */
function arrowHead(x: number, y: number, deg: number, len = 5, half = 2.8): SymbolPrim {
  const a = (deg * Math.PI) / 180;
  const bx = x - len * Math.cos(a), by = y - len * Math.sin(a);
  const px = -Math.sin(a) * half, py = Math.cos(a) * half;
  return path(`M${n(x)} ${n(y)}L${n(bx + px)} ${n(by + py)}L${n(bx - px)} ${n(by - py)}Z`, "solid");
}

const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};

/** Horizontal bow-tie valve body centred at (cx, cy). */
function bowTie(cx: number, cy: number, halfW = 15, halfH = 8.5): SymbolPrim {
  const x0 = cx - halfW, x1 = cx + halfW;
  return path(`M${n(x0)} ${n(cy - halfH)}V${n(cy + halfH)}L${n(x1)} ${n(cy - halfH)}V${n(cy + halfH)}Z`, "body");
}

/** Converter box (IEC 60617 style): square with corner-to-corner diagonal. */
function converter(tl: string[], br: string[], extra: SymbolPrim[] = []): SymbolPrim[] {
  return [
    rect(10, 10, 28, 28, 3, "body"),
    path("M10 38L38 10"),
    ...tl.map((d) => path(d)),
    ...br.map((d) => path(d)),
    ...extra,
  ];
}
const TL = { cx: 17.6, cy: 17.4 };
const BR = { cx: 30.4, cy: 30.6 };

/** Volute (blower housing): clockwise expanding spiral with a tangential outlet at the top-right. */
function volutePath(cx: number, cy: number): string {
  const r0 = 10.2, r1 = 15.5, start = 28, steps = 40;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const phi = start + ((360 - start) * i) / steps; // clockwise from 12 o'clock
    const r = r0 + ((r1 - r0) * i) / steps;
    const a = ((phi - 90) * Math.PI) / 180;
    pts.push(`${n(cx + r * Math.cos(a))} ${n(cy + r * Math.sin(a))}`);
  }
  const [sx, sy] = [cx + r0 * Math.cos(((start - 90) * Math.PI) / 180), cy + r0 * Math.sin(((start - 90) * Math.PI) / 180)];
  return `M${pts.join("L")}H43V${n(sy)}H${n(sx)}Z`;
}

// ---- Symbols --------------------------------------------------------------------------------

const PUMP_FEET = (cx: number, cy: number, r: number) => {
  const [lx, ly] = polar(cx, cy, r, 125);
  const [rx, ry] = polar(cx, cy, r, 55);
  return path(`M${n(lx)} ${n(ly)}L${n(lx - 3.2)} 43H${n(rx + 3.2)}L${n(rx)} ${n(ry)}`);
};

const motorBase = (sub: string): SymbolPrim[] => [
  rect(35, 21.4, 8, 5.2, 1, "surface"),
  circle(22, 24, 14, "body"),
  path(glyph.M(22, 21, 9.5)),
  path(sub),
];

const fanBlade = "M24 21.2C20.6 19.2 19.4 14.6 21.6 11.6C23.1 11.2 25.2 11.3 26.5 12.1C27.8 15.2 27.2 19 24 21.2Z";

const GEOMETRY: Record<Exclude<SymbolKindName, "sensor">, SymbolPrim[]> = {
  // ---- rotating ------------------------------------------------------------------------
  motor: motorBase(glyph.tilde(22, 30.6, 8, 2)),
  dc_motor: motorBase(glyph.equals(22, 30.6, 8, 3)),
  pump_centrifugal: [
    PUMP_FEET(22, 26, 13),
    path("M22 13H42V20.4H33.4", "surface"),
    circle(22, 26, 13, "body"),
    path("M18 20L28.4 26L18 32Z", "hub"),
  ],
  pump_pd: [
    path("M4 24H11M37 24H44"),
    PUMP_FEET(24, 24, 13),
    circle(24, 24, 13, "body"),
    circle(19.6, 24, 4.4, "hub"),
    circle(28.4, 24, 4.4, "hub"),
  ],
  fan: [
    circle(24, 24, 14, "body"),
    path(fanBlade, "surface"),
    { t: "g", transform: "rotate(120 24 24)", children: [path(fanBlade, "surface")] },
    { t: "g", transform: "rotate(240 24 24)", children: [path(fanBlade, "surface")] },
    circle(24, 24, 2.6, "hub"),
  ],
  blower: [
    path(volutePath(21, 26), "body"),
    circle(21, 26, 6.2),
    circle(21, 26, 2.2, "hub"),
  ],
  compressor: [
    circle(24, 24, 14, "body"),
    (() => {
      const [a, b] = polar(24, 24, 14, 232);
      const [c, d] = polar(24, 24, 14, -18);
      const [e, f] = polar(24, 24, 14, 128);
      const [g, h] = polar(24, 24, 14, 18);
      return path(`M${n(a)} ${n(b)}L${n(c)} ${n(d)}M${n(e)} ${n(f)}L${n(g)} ${n(h)}`);
    })(),
  ],
  conveyor: [
    rect(18, 13.5, 12, 9, 1, "surface"),
    path("M11 23H37A5 5 0 0 1 37 33H11A5 5 0 0 1 11 23Z", "body"),
    circle(11, 28, 2.6, "hub"),
    circle(37, 28, 2.6, "hub"),
    circle(24, 28, 1.3, "solid"),
    path("M9 40H39", "line", { dash: true }),
  ],

  // ---- electrical ----------------------------------------------------------------------
  vfd: converter(
    [glyph.tilde(TL.cx, TL.cy, 9)],
    [glyph.tilde(BR.cx, BR.cy, 9)],
    [path("M27.5 36.2L34.4 29.3"), arrowHead(36.2, 27.5, -45, 4, 2.2)],
  ),
  inverter: converter([glyph.equals(TL.cx, TL.cy, 9)], [glyph.tilde(BR.cx, BR.cy, 9)]),
  dc_dc_converter: converter([glyph.equals(TL.cx, TL.cy, 9)], [glyph.equals(BR.cx, BR.cy, 9)]),
  power_supply: converter([glyph.tilde(TL.cx, TL.cy, 9)], [glyph.equals(BR.cx, BR.cy, 9)]),
  charge_controller: [
    rect(10, 10, 28, 28, 3, "body"),
    path("M15 14.5V33H34", "line"),
    path("M15 18.5H23.5C28.2 18.5 30.4 21.4 31.6 33"),
    circle(27.2, 19.6, 1.9, "solid"),
  ],
  transformer: [
    path("M24 4V9.5M24 38.5V44"),
    circle(24, 18.5, 9, "body"),
    circle(24, 29.5, 9, "body"),
    circle(24, 18.5, 9, "line"),
  ],
  breaker: [
    path("M24 4V12M24 36V44"),
    rect(12, 12, 24, 24, 2.5, "body"),
    path("M24 31L18.4 18.6"),
    path("M22 16.2L26 20.2M26 16.2L22 20.2"),
    circle(24, 31, 1.6, "solid"),
  ],
  contactor: [
    path("M24 4V16M24 33V44"),
    path("M20.2 16A3.8 3.8 0 0 0 27.8 16"),
    path("M24 33L16.5 17.5"),
    circle(24, 33, 1.6, "solid"),
    path("M20.3 25.4H32.5", "line", { dash: true }),
    rect(32.5, 20, 9, 11, 1.5, "body"),
  ],
  fuse: [
    rect(17.5, 10, 13, 28, 2, "body"),
    path("M24 4V44"),
  ],
  disconnect: [
    path("M24 4V15M19.5 15H28.5"),
    path("M24 33L14.8 17.2"),
    path("M24 33V44"),
    circle(24, 33, 1.7, "solid"),
  ],
  busbar: [
    path("M24 5V18.5"),
    path("M12 23.5V35.5M24 23.5V35.5M36 23.5V35.5"),
    rect(4, 18.5, 40, 5, 1, "body"),
    circle(12, 38, 2.2, "surface"),
    circle(24, 38, 2.2, "surface"),
    circle(36, 38, 2.2, "surface"),
  ],
  pv_array: [
    path("M6 42H34L41 24H13Z", "body"),
    path("M15.33 42L22.33 24M24.67 42L31.67 24M9.5 33H37.5"),
    circle(13, 11, 3.6),
    path(
      [0, 60, 120, 180, 240, 300]
        .map((d) => {
          const [a, b] = polar(13, 11, 5.8, d);
          const [c, e] = polar(13, 11, 8, d);
          return `M${n(a)} ${n(b)}L${n(c)} ${n(e)}`;
        })
        .join(""),
    ),
  ],
  battery: [
    path("M24 4V14M24 34V44"),
    path("M12 14H36"),
    rect(17.5, 18.2, 13, 2.8, 0.6, "solid"),
    path("M24 21V27", "line", { dash: true }),
    path("M12 27H36"),
    rect(17.5, 31.2, 13, 2.8, 0.6, "solid"),
    path(glyph.plus(38.6, 10, 2.2)),
    path(glyph.minus(38.6, 38, 2.2)),
  ],
  lamp: [
    path("M4 24H12M36 24H44"),
    circle(24, 24, 12, "body"),
    path("M15.5 15.5L32.5 32.5M32.5 15.5L15.5 32.5"),
    path(
      [-90, -45, -135, 90, 45, 135]
        .map((d) => {
          const [a, b] = polar(24, 24, 15.2, d);
          const [c, e] = polar(24, 24, 18.6, d);
          return `M${n(a)} ${n(b)}L${n(c)} ${n(e)}`;
        })
        .join(""),
      "line",
      { when: "running" },
    ),
  ],

  // ---- process -------------------------------------------------------------------------
  valve_control: [
    path("M24 30V14"),
    bowTie(24, 30),
    path("M14 14A10 10 0 0 1 34 14Z", "body"),
  ],
  valve_onoff: [
    path("M24 30V13"),
    bowTie(24, 30),
    path("M16.5 13H31.5", "line", { heavy: true }),
  ],
  valve_solenoid: [
    path("M24 30V16"),
    bowTie(24, 30),
    rect(17, 5, 14, 11, 1.5, "body"),
    path(glyph.S(24, 10.5, 6.8)),
  ],
  valve_check: [
    bowTie(24, 30),
    path("M11 14H31"),
    arrowHead(37, 14, 0, 6, 3.2),
  ],
  valve_relief: [
    path("M24 30V26.5L19.5 24.8L28.5 21.6L19.5 18.4L28.5 15.2L24 13.5V9M19 9H29"),
    path("M17 44L31 44L24 30Z", "body"),
    path("M38 23L38 37L24 30Z", "body"),
  ],
  tank: [
    path("M11 12.5A13 5 0 0 1 37 12.5V35.5A13 5 0 0 1 11 35.5Z", "body"),
    path("M11 25H37", "line", { dash: true }),
    path("M28.5 20.6H33.5L31 24.6Z", "solid"),
  ],
  heat_exchanger: [
    path("M17 15V8M31 33V40"),
    rect(6, 15, 36, 18, 9, "body"),
    path("M4 28.5H11L14.5 19.5L18.8 28.5L23.1 19.5L27.4 28.5L31.7 19.5L35 28.5H44"),
  ],
  boiler: [
    path("M24 4V10"),
    rect(11, 10, 26, 33, 4, "body"),
    path(glyph.tilde(24, 17.5, 10, 2.4)),
    path("M24 38C20.2 38 18.6 35 19.6 32.2C20.4 30 22.4 28.8 22.6 25.6C25.8 27.3 29 30.6 28.6 34C28.3 36.4 26.4 38 24 38Z", "hub"),
  ],
  filter: [
    path("M4 24H9M39 24H44"),
    path("M24 9L39 24L24 39L9 24Z", "body"),
    path("M24 11V37", "line", { dash: true }),
  ],

  // ---- structural / mechanical ---------------------------------------------------------
  coupling: [
    path("M4 24H16M32 24H44"),
    rect(15, 12, 6, 24, 1.2, "body"),
    rect(27, 12, 6, 24, 1.2, "body"),
    path("M21 18H27M21 30H27", "line", { dash: true }),
  ],
  bearing: [
    path("M8 41H40"),
    path("M11 41V36.5H15.6L17 30.4A11.2 11.2 0 1 1 31 30.4L32.4 36.5H37V41", "body"),
    circle(24, 22, 6.6, "line"),
    circle(24, 22, 2.8, "hub"),
  ],
  duct: [
    rect(4, 15, 40, 18, 0, "body"),
    path("M12 11.5V36.5M36 11.5V36.5"),
    path("M16.5 24H27"),
    arrowHead(32, 24, 0, 5.5, 3),
  ],
  pipe: [
    path("M8 18.5H39A3 5.5 0 0 1 39 29.5H8", "body"),
    { t: "ellipse", cx: 8, cy: 24, rx: 3, ry: 5.5, paint: "surface" },
    path("M18 24H26"),
    arrowHead(31, 24, 0, 5, 2.8),
  ],

  // ---- control -------------------------------------------------------------------------
  plc: [
    path("M5 21H10M5 26H10M5 31H10M38 21H43M38 26H43M38 31H43"),
    rect(10, 9, 28, 30, 2.5, "body"),
    path("M10 15.5H38"),
    circle(14, 12.3, 1.1, "solid"),
    circle(18, 12.3, 1.1, "hub"),
    path("M14.5 27H20.5M20.5 22.5V31.5M27.5 22.5V31.5M27.5 27H33.5"),
  ],
  plc_io: [
    path("M8 14H14M8 21.3H14M8 28.7H14M8 36H14"),
    rect(14, 7, 20, 34, 2.5, "body"),
    ...[14, 21.3, 28.7, 36].map((y) => circle(19.6, y, 2, "surface")),
    ...[14, 21.3, 28.7, 36].map((y) => rect(26, y - 1.5, 4, 3, 0.6, "hub")),
  ],
  hmi: [
    path("M24 34V39.5M17 40H31"),
    rect(6, 9, 36, 25, 2.5, "body"),
    rect(10, 13, 28, 17, 1, "surface"),
    path("M13 26L17.5 22L21.5 24.5L26.5 18L30.5 20.5L35 16.5"),
  ],
  generic: [
    rect(10, 11, 28, 26, 3, "body"),
    rect(17, 20, 14, 8, 1.5),
  ],
};

function sensorGeometry(tag: string | undefined, mounting: SensorMounting | undefined, px = 48): SymbolPrim[] {
  const letters = (tag ?? "").trim().toUpperCase() || "?";
  const compact = px < 32;
  const size: "md" | "sm" | "xs" = letters.length <= 2 ? (compact ? "md" : "sm") : compact ? "sm" : "xs";
  const prims: SymbolPrim[] = [path("M24 35V44", "line", { dash: true }), circle(24, 22, 13, "surface")];
  if (mounting === "panel") {
    prims.push(path("M11 22H37"));
    prims.push({ t: "text", x: 24, y: 19.4, text: letters, size: "xs" });
  } else {
    prims.push({ t: "text", x: 24, y: size === "md" ? 26.6 : size === "sm" ? 25.4 : 25, text: letters, size });
  }
  return prims;
}

/** Primitive list for a symbol kind. Unknown kinds fall back to `generic`. */
export function symbolGeometry(kind: string, opts: SymbolGeometryOptions = {}): SymbolPrim[] {
  if (kind === "sensor") return sensorGeometry(opts.tag, opts.mounting, opts.size);
  return GEOMETRY[kind as Exclude<SymbolKindName, "sensor">] ?? GEOMETRY.generic;
}
