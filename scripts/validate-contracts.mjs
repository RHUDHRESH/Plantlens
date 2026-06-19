#!/usr/bin/env node
/**
 * Contract smoke test (real, working tooling — NOT product code).
 *
 * Validates the demo-microgrid sample bundle against the JSON Schemas in packages/contracts.
 * Run: `pnpm contracts:validate`  (needs: pnpm add -Dw ajv ajv-formats)
 *
 * This is the canary for the whole contract layer: if the demo bundle stops validating, a schema
 * and its sample drifted apart and the build should fail. Wire this into CI (the contract-validate
 * job). As you add contracts/sample files, extend the PAIRS list below.
 *
 * YAML note: action_envelope is authored as YAML; this script validates the JSON files only.
 * Validate action_envelope.yaml in the backend (it parses YAML there anyway) or add a YAML loader.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const contracts = join(root, "packages", "contracts");
const bundle = join(root, "packages", "sample-data", "demo-microgrid");

// [schema file, sample file] pairs. Compiled outputs (hmi_view_model) and runtime-only contracts
// (tag_frame, situation, calm_card, incident, audit) are validated by backend tests, not here.
const PAIRS = [
  ["plant.schema.json", "plant.json"],
  ["tag_map.schema.json", "tag_map.json"],
  ["alarm_rules.schema.json", "alarm_rules.json"],
  ["causal_graph.schema.json", "causal_graph.json"],
  ["scenarios.schema.json", "scenarios.json"]
];

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

let failures = 0;
for (const [schemaFile, dataFile] of PAIRS) {
  const schema = JSON.parse(readFileSync(join(contracts, schemaFile), "utf8"));
  const data = JSON.parse(readFileSync(join(bundle, dataFile), "utf8"));
  const validate = ajv.compile(schema);
  if (validate(data)) {
    console.log(`  ok   ${dataFile}  ✓  ${schemaFile}`);
  } else {
    failures++;
    console.error(`  FAIL ${dataFile}  ✗  ${schemaFile}`);
    for (const e of validate.errors ?? []) {
      console.error(`        ${e.instancePath || "/"} ${e.message}`);
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} contract(s) failed validation.`);
  process.exit(1);
}
console.log("\nAll contracts valid against the demo bundle.");
