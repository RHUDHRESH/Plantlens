#!/usr/bin/env node
/**
 * Frontend contract-mirror canary (Wave 3).
 *
 * Ensures critical packages/contracts schemas have a frontend mirror under
 * apps/web/src/app/schemas that:
 *   1. Exists at the expected path
 *   2. Exports a type/interface/schema named for the contract
 *   3. Mentions each JSON Schema top-level `required[]` field as a string
 *      (catches silent renames / missing keys without a full Zod AST parse)
 *
 * Run: `pnpm check:contracts-frontend`
 *
 * Note: some mirrors are still TS interfaces (TagFrame, Situation, …) while
 * others are Zod (`plantAssemblySchema`). Both are accepted as long as the
 * export name and required field inventory line up.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const contractsDir = join(root, "packages", "contracts");
const schemasDir = join(root, "apps", "web", "src", "app", "schemas");

/**
 * Critical runtime/derived contracts that the HMI must stay aligned with.
 * `exportNames`: any one matching export is enough (interface, type, or Zod const).
 */
const CRITICAL = [
  {
    contract: "tag_frame.schema.json",
    frontend: "tagFrame.ts",
    exportNames: ["TagFrame", "tagFrameSchema", "TagFrameSchema"],
  },
  {
    contract: "situation.schema.json",
    frontend: "situation.ts",
    exportNames: ["Situation", "situationSchema", "SituationSchema"],
  },
  {
    contract: "calm_card.schema.json",
    frontend: "calmCard.ts",
    exportNames: ["CalmCard", "calmCardSchema", "CalmCardSchema"],
  },
  {
    contract: "fault_matrix.schema.json",
    frontend: "faultMatrix.ts",
    exportNames: ["FaultMatrix", "faultMatrixSchema", "FaultMatrixSchema"],
  },
];

function exportPresent(source, name) {
  const patterns = [
    new RegExp(`export\\s+(?:interface|type)\\s+${name}\\b`),
    new RegExp(`export\\s+(?:const|let|var|function|class)\\s+${name}\\b`),
    new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`),
  ];
  return patterns.some((re) => re.test(source));
}

function requiredFields(schema) {
  const req = schema?.required;
  return Array.isArray(req) ? req.filter((k) => typeof k === "string") : [];
}

let failures = 0;

for (const item of CRITICAL) {
  const schemaPath = join(contractsDir, item.contract);
  const frontendPath = join(schemasDir, item.frontend);
  const label = `${item.contract} → ${item.frontend}`;

  if (!existsSync(schemaPath)) {
    failures++;
    console.error(`FAIL  missing contract ${schemaPath}`);
    continue;
  }
  if (!existsSync(frontendPath)) {
    failures++;
    console.error(`FAIL  ${label}: frontend mirror missing`);
    continue;
  }

  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const source = readFileSync(frontendPath, "utf8");

  const matchedExport = item.exportNames.find((n) => exportPresent(source, n));
  if (!matchedExport) {
    failures++;
    console.error(
      `FAIL  ${label}: expected export one of [${item.exportNames.join(", ")}]`,
    );
  } else {
    console.log(`  ok   ${label}: exports ${matchedExport}`);
  }

  const missing = requiredFields(schema).filter((field) => !source.includes(field));
  if (missing.length > 0) {
    failures++;
    console.error(
      `FAIL  ${label}: required fields not found in mirror: ${missing.join(", ")}`,
    );
  } else {
    const n = requiredFields(schema).length;
    console.log(`  ok   ${label}: ${n} required field(s) present in source`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} frontend contract drift check(s) failed.`);
  process.exit(1);
}
console.log("\nCritical frontend contract mirrors look aligned.");
