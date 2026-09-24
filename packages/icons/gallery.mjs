#!/usr/bin/env node
/**
 * Review gallery: renders every symbol exactly as the app does (class mode + the real tokens.css
 * and ui.css "Equipment symbols" rules) at 24 / 48 / 96 px, stopped vs running, plus status
 * variants, in the light and dark themes. Optionally screenshots both pages with Playwright.
 *
 *   node packages/icons/gallery.mjs <out-dir> [--shot]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SYMBOL_KINDS, SYMBOL_META, renderSymbolSvg } from "./render.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, "../../apps/web");
const outDir = resolve(process.argv[2] ?? join(here, "gallery"));
const shot = process.argv.includes("--shot");

const tokens = readFileSync(join(web, "src/styles/tokens.css"), "utf8");
const ui = readFileSync(join(web, "src/styles/ui.css"), "utf8");
const symbolCss = ui.slice(ui.indexOf("/* ---------- Equipment symbols ---------- */"));
const font = pathToFileURL(join(web, "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2")).href;

const TAGS = { sensor: "TT" };
const cell = (kind) => {
  const tag = TAGS[kind];
  const s = (size, state) => renderSymbolSvg(kind, { mode: "class", size, state, tag });
  return `<figure><div class="row">${s(24, "stopped")}${s(48, "stopped")}${s(96, "stopped")}<span class="sep"></span>${s(48, "running")}</div><figcaption><b>${kind}</b> · ${SYMBOL_META[kind].label}</figcaption></figure>`;
};

const statusRow = () => {
  const statuses = ["normal", "critical", "high", "medium", "sensor_bad", "offline"];
  const kinds = ["motor", "pump_centrifugal", "breaker", "valve_control", "vfd"];
  return kinds
    .map(
      (k) =>
        `<div class="srow">${statuses
          .map((st) => `<div class="scell">${renderSymbolSvg(k, { mode: "class", size: 48, state: "running", status: st })}<small>${st}</small></div>`)
          .join("")}</div>`,
    )
    .join("");
};

const sensors = () =>
  ["TT", "PT", "IT", "ST", "VT", "FT", "ET", "ZS", "FIC"]
    .map((t) => renderSymbolSvg("sensor", { mode: "class", size: 48, tag: t }))
    .join("") + renderSymbolSvg("sensor", { mode: "class", size: 48, tag: "PI", mounting: "panel" }) + renderSymbolSvg("sensor", { mode: "class", size: 96, tag: "TT" });

const page = (theme) => `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><title>PlantLens symbols (${theme})</title>
<style>
@font-face { font-family: "Inter Variable"; src: url("${font}") format("woff2"); font-weight: 100 900; }
${tokens}
${symbolCss}
* { box-sizing: border-box; }
body { margin: 0; padding: 24px; background: var(--canvas); color: var(--text); font: 12px var(--font-sans); }
h1 { font-size: 16px; margin: 0 0 16px; font-weight: 600; }
h2 { font-size: 13px; margin: 24px 0 10px; color: var(--text-muted); font-weight: 600; }
.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
figure { margin: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px 8px; }
.row { display: flex; align-items: center; gap: 14px; height: 100px; }
.sep { width: 1px; align-self: stretch; background: var(--border); }
figcaption { color: var(--text-muted); margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
figcaption b { color: var(--text); font-weight: 600; }
.srow { display: flex; gap: 10px; margin-bottom: 8px; }
.scell { display: flex; flex-direction: column; align-items: center; gap: 2px; width: 76px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 6px; }
.scell small { color: var(--text-muted); font-size: 10px; }
.sensors { display: flex; align-items: center; gap: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px; }
</style></head><body>
<h1>PlantLens equipment symbols · ${theme} · 24 / 48 / 96 px stopped │ 48 px running</h1>
<div class="grid">${SYMBOL_KINDS.map(cell).join("")}</div>
<h2>Status variants (running)</h2>${statusRow()}
<h2>Instrument bubbles (ISA-5.1)</h2><div class="sensors">${sensors()}</div>
</body></html>`;

mkdirSync(outDir, { recursive: true });
const files = [];
for (const theme of ["light", "dark"]) {
  const f = join(outDir, `symbols-gallery-${theme}.html`);
  writeFileSync(f, page(theme));
  files.push([theme, f]);
}
console.log(`gallery → ${outDir}`);

if (shot) {
  const require = createRequire(join(web, "package.json"));
  const { chromium } = require("@playwright/test");
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" });
  const pg = await browser.newPage({ viewport: { width: 1480, height: 900 }, deviceScaleFactor: Number(process.env.DPR ?? 1) });
  for (const [theme, f] of files) {
    await pg.goto(pathToFileURL(f).href);
    await pg.evaluate(() => document.fonts.ready);
    const png = join(outDir, `symbols-gallery-${theme}.png`);
    await pg.screenshot({ path: png, fullPage: true });
    console.log(`screenshot → ${png}`);
  }
  await browser.close();
}
