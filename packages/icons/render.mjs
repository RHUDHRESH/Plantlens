/**
 * String renderer for the PlantLens equipment symbols. Reads the SAME geometry module as the React
 * renderer (apps/web/src/components/symbols/geometry.ts) — Node ≥ 22.18 strips its types natively.
 *
 *   mode "static": standalone file, stroke="currentColor", outline look (docs / external tools)
 *   mode "class":  the exact class names the React component emits (pl-sym, pl-sym-fill, …) so
 *                  a page that loads the tokens + ui.css rules renders it like the app (gallery)
 */
import { SYMBOL_KINDS, SYMBOL_META, symbolGeometry } from "../../apps/web/src/components/symbols/geometry.ts";

export { SYMBOL_KINDS, SYMBOL_META, symbolGeometry };

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const TEXT_SIZE = { md: 13, sm: 9.5, xs: 8 };

function classFor(prim, state) {
  const cls = [];
  switch (prim.paint ?? "line") {
    case "body": cls.push(state === "running" ? "pl-sym-fill-on" : "pl-sym-fill"); break;
    case "surface": cls.push("pl-sym-fill"); break;
    case "solid": cls.push("pl-sym-solid"); break;
    case "hub": cls.push(state === "running" ? "pl-sym-solid" : "pl-sym-fill"); break;
    default: break;
  }
  if (prim.dash) cls.push("pl-sym-dash");
  if (prim.heavy) cls.push("pl-sym-heavy");
  return cls.join(" ");
}

function staticAttrs(prim) {
  const a = [];
  const paint = prim.paint ?? "line";
  if (paint === "solid") a.push('fill="currentColor" stroke="none"');
  if (prim.dash) a.push('stroke-dasharray="2.4 2.2"');
  if (prim.heavy) a.push('stroke-width="2.6"');
  return a.join(" ");
}

function prims(list, mode, state, indent) {
  let out = "";
  for (const p of list) {
    if (p.when === "running" && state !== "running") continue;
    if (p.t === "g") {
      out += `${indent}<g transform="${p.transform}">\n${prims(p.children, mode, state, indent + "  ")}${indent}</g>\n`;
      continue;
    }
    if (p.t === "text") {
      const attrs =
        mode === "static"
          ? `fill="currentColor" stroke="none" font-family="Inter, system-ui, sans-serif" font-weight="600" font-size="${TEXT_SIZE[p.size]}"`
          : `class="pl-sym-text${p.size === "md" ? "" : p.size === "sm" ? " pl-sym-text--small" : " pl-sym-text--xs"}"`;
      out += `${indent}<text x="${p.x}" y="${p.y}" text-anchor="middle" ${attrs}>${esc(p.text)}</text>\n`;
      continue;
    }
    const style = mode === "static" ? staticAttrs(p) : classFor(p, state) ? `class="${classFor(p, state)}"` : "";
    const geo =
      p.t === "circle" ? `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}"`
      : p.t === "ellipse" ? `<ellipse cx="${p.cx}" cy="${p.cy}" rx="${p.rx}" ry="${p.ry}"`
      : p.t === "rect" ? `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}"${p.rx ? ` rx="${p.rx}"` : ""}`
      : `<path d="${p.d}"`;
    out += `${indent}${geo}${style ? " " + style : ""}/>\n`;
  }
  return out;
}

/**
 * @param {string} kind
 * @param {{ mode?: "static" | "class", state?: string, status?: string, tag?: string, mounting?: string, size?: number, title?: string }} [o]
 */
export function renderSymbolSvg(kind, o = {}) {
  const mode = o.mode ?? "static";
  const state = o.state ?? "unknown";
  const size = o.size ?? 48;
  const list = symbolGeometry(kind, { tag: o.tag, mounting: o.mounting, size: mode === "static" ? 48 : size });
  const title = o.title ?? SYMBOL_META[kind]?.label ?? kind;
  if (mode === "static") {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" role="img">\n` +
      `  <title>${esc(title)}</title>\n` +
      prims(list, mode, state, "  ") +
      `</svg>\n`
    );
  }
  const status = o.status ?? "normal";
  return (
    `<svg viewBox="0 0 48 48" width="${size}" height="${size}" class="pl-symbol pl-symbol--${status} pl-symbol--${state}" role="img"><title>${esc(title)}</title>` +
    `<g class="pl-sym">${prims(list, mode, state, "")}</g></svg>`
  );
}
