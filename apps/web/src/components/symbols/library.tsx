/**
 * React renderer for the equipment symbol set. The shapes themselves are plain data in
 * ./geometry.ts (shared with packages/icons/build-svg.mjs); this file only maps paint roles onto
 * the token-driven classes from styles/ui.css ("Equipment symbols"). No colours live here.
 */
import type { ReactElement } from "react";
import { SYMBOL_KINDS, symbolGeometry, type SymbolPrim } from "./geometry";
import type { RunState, SymbolKind, SymbolRenderer } from "./index";

function paintClass(prim: Exclude<SymbolPrim, { t: "text" } | { t: "g" }>, state: RunState): string | undefined {
  const cls: string[] = [];
  switch (prim.paint ?? "line") {
    case "body":
      cls.push(state === "running" ? "pl-sym-fill-on" : "pl-sym-fill");
      break;
    case "surface":
      cls.push("pl-sym-fill");
      break;
    case "solid":
      cls.push("pl-sym-solid");
      break;
    case "hub":
      cls.push(state === "running" ? "pl-sym-solid" : "pl-sym-fill");
      break;
    default:
      break;
  }
  if (prim.dash) cls.push("pl-sym-dash");
  if (prim.heavy) cls.push("pl-sym-heavy");
  return cls.length ? cls.join(" ") : undefined;
}

const TEXT_CLASS = { md: "pl-sym-text", sm: "pl-sym-text pl-sym-text--small", xs: "pl-sym-text pl-sym-text--xs" } as const;

export function renderPrims(prims: SymbolPrim[], state: RunState): ReactElement[] {
  const out: ReactElement[] = [];
  prims.forEach((p, i) => {
    if (p.t === "g") {
      out.push(
        <g key={i} transform={p.transform}>
          {renderPrims(p.children, state)}
        </g>,
      );
      return;
    }
    if (p.t === "text") {
      out.push(
        <text key={i} x={p.x} y={p.y} textAnchor="middle" className={TEXT_CLASS[p.size]}>
          {p.text}
        </text>,
      );
      return;
    }
    if (p.when === "running" && state !== "running") return;
    const className = paintClass(p, state);
    switch (p.t) {
      case "circle":
        out.push(<circle key={i} cx={p.cx} cy={p.cy} r={p.r} className={className} />);
        break;
      case "ellipse":
        out.push(<ellipse key={i} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} className={className} />);
        break;
      case "rect":
        out.push(<rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx={p.rx || undefined} className={className} />);
        break;
      case "path":
        out.push(<path key={i} d={p.d} className={className} />);
        break;
    }
  });
  return out;
}

function makeRenderer(kind: SymbolKind): SymbolRenderer {
  const renderer: SymbolRenderer = ({ state, tag, mounting, size }) => (
    <g className="pl-sym" data-symbol={kind}>
      {renderPrims(symbolGeometry(kind, { tag, mounting, size }), state)}
    </g>
  );
  return renderer;
}

export const SYMBOL_RENDERERS = Object.fromEntries(SYMBOL_KINDS.map((k) => [k, makeRenderer(k)])) as Record<
  SymbolKind,
  SymbolRenderer
> & { generic: SymbolRenderer };
