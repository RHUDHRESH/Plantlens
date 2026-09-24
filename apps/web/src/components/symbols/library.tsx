/**
 * Symbol renderers on a 48×48 grid. Interim set; the full ISA-101 library replaces this file.
 * Every renderer uses currentColor-free classes so tokens drive stroke/fill in both themes.
 */
import type { SymbolKind, SymbolRenderer } from "./index";

const body = (state: string) => (state === "running" ? "pl-sym-fill-on" : "pl-sym-fill");

const motor: SymbolRenderer = ({ state }) => (
  <g className="pl-sym">
    <circle cx="24" cy="24" r="15" className={body(state)} />
    <text x="24" y="28.5" textAnchor="middle" className="pl-sym-text">M</text>
  </g>
);

const generic: SymbolRenderer = ({ state }) => (
  <g className="pl-sym">
    <rect x="9" y="11" width="30" height="26" rx="3" className={body(state)} />
  </g>
);

const sensor: SymbolRenderer = ({ tag }) => (
  <g className="pl-sym">
    <circle cx="24" cy="24" r="13" className="pl-sym-fill" />
    <text x="24" y="28" textAnchor="middle" className="pl-sym-text pl-sym-text--small">{tag ?? "?"}</text>
  </g>
);

export const SYMBOL_RENDERERS: Record<SymbolKind, SymbolRenderer> & { generic: SymbolRenderer } = new Proxy(
  { motor, dc_motor: motor, sensor, generic } as Record<string, SymbolRenderer>,
  { get: (target, key: string) => target[key] ?? generic },
) as Record<SymbolKind, SymbolRenderer> & { generic: SymbolRenderer };
