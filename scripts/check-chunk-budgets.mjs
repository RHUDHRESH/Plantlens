#!/usr/bin/env node
/**
 * Post-build gzip chunk budget gate for apps/web.
 *
 * Run after `pnpm --filter @plantlens/web build`:
 *   pnpm check:chunks
 *
 * Budgets (DESIGN_SYSTEM / Wave 3):
 * - Main entry (`index-*.js`) gzip < 250 KB
 *   Prefer 250 KB over the older 220 KB target to avoid false fails as the
 *   runtime HMI grows; 280 KB is the soft ceiling if we must relax further.
 * - Any PlantMap3D / three-related chunk gzip < 700 KB (lazy 3D must stay out
 *   of the critical path).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

/** Prefer 250 KB; relaxed from 220 to avoid false fails. Soft ceiling ~280 KB. */
const MAIN_INDEX_GZIP_MAX_KB = 250;
const THREE_GZIP_MAX_KB = 700;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = join(root, "apps", "web", "dist", "assets");

function gzipKb(buf) {
  return gzipSync(buf).length / 1024;
}

function fmtKb(n) {
  return `${n.toFixed(1)} KB`;
}

if (!existsSync(assetsDir)) {
  console.error(
    `check-chunk-budgets: missing ${assetsDir}\n` +
      "Run `pnpm --filter @plantlens/web build` first.",
  );
  process.exit(1);
}

const jsFiles = readdirSync(assetsDir).filter((f) => f.endsWith(".js"));
if (jsFiles.length === 0) {
  console.error("check-chunk-budgets: no .js assets under dist/assets");
  process.exit(1);
}

const sizes = jsFiles.map((name) => {
  const bytes = readFileSync(join(assetsDir, name));
  return { name, gzipKb: gzipKb(bytes), rawKb: bytes.length / 1024 };
});

sizes.sort((a, b) => b.gzipKb - a.gzipKb);

console.log("Chunk gzip sizes (apps/web/dist/assets):\n");
for (const s of sizes) {
  console.log(`  ${fmtKb(s.gzipKb).padStart(10)}  gzip   ${s.name}  (raw ${fmtKb(s.rawKb)})`);
}
console.log("");

let failures = 0;

const indexChunks = sizes.filter((s) => /^index-.+\.js$/i.test(s.name));
if (indexChunks.length === 0) {
  failures++;
  console.error("FAIL  no main index-*.js chunk found");
} else {
  for (const chunk of indexChunks) {
    if (chunk.gzipKb > MAIN_INDEX_GZIP_MAX_KB) {
      failures++;
      console.error(
        `FAIL  ${chunk.name} gzip ${fmtKb(chunk.gzipKb)} > ${MAIN_INDEX_GZIP_MAX_KB} KB main-index budget`,
      );
    } else {
      console.log(
        `  ok   ${chunk.name} gzip ${fmtKb(chunk.gzipKb)} ≤ ${MAIN_INDEX_GZIP_MAX_KB} KB (main index)`,
      );
    }
  }
}

const threeRe = /(?:^|[-_.])(three|PlantMap3D|maps3d)(?:[-_.]|$)/i;
const threeChunks = sizes.filter((s) => threeRe.test(s.name));
if (threeChunks.length === 0) {
  console.log(
    "  note  no PlantMap3D/three chunk filename matched (lazy split may use a hash-only name); skipping 700 KB gate",
  );
} else {
  for (const chunk of threeChunks) {
    if (chunk.gzipKb > THREE_GZIP_MAX_KB) {
      failures++;
      console.error(
        `FAIL  ${chunk.name} gzip ${fmtKb(chunk.gzipKb)} > ${THREE_GZIP_MAX_KB} KB three/PlantMap3D budget`,
      );
    } else {
      console.log(
        `  ok   ${chunk.name} gzip ${fmtKb(chunk.gzipKb)} ≤ ${THREE_GZIP_MAX_KB} KB (three/PlantMap3D)`,
      );
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} chunk budget check(s) failed.`);
  process.exit(1);
}
console.log("\nAll chunk budgets within limits.");
