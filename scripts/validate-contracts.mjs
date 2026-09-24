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
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const contracts = join(root, "packages", "contracts");
const bundle = join(root, "packages", "sample-data", "demo-microgrid");

// [schema file, sample file] pairs. Compiled outputs (hmi_view_model) and runtime-only contracts
// (tag_frame, situation, calm_card, incident, audit) are validated by backend tests, not here.
const componentLibrary = join(root, "packages", "sample-data", "component-library");

const causalPatterns = join(componentLibrary, "causal_patterns");

const PAIRS = [
  ["plant.schema.json", "plant.json"],
  ["tag_map.schema.json", "tag_map.json"],
  ["alarm_rules.schema.json", "alarm_rules.json"],
  ["causal_graph.schema.json", "causal_graph.json"],
  ["scenarios.schema.json", "scenarios.json"],
  ["component_library.schema.json", "standard_components.json", componentLibrary],
  ["plant_assembly.schema.json", "demo_motor_fan_blower_assembly.json", componentLibrary],
  // Every per-component causal pattern library.
  ...readdirSync(causalPatterns)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ["causal_pattern_library.schema.json", f, causalPatterns]),
];

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const validators = new Map();
function validatorFor(schemaFile) {
  if (!validators.has(schemaFile)) {
    validators.set(schemaFile, ajv.compile(JSON.parse(readFileSync(join(contracts, schemaFile), "utf8"))));
  }
  return validators.get(schemaFile);
}

let failures = 0;
for (const [schemaFile, dataFile, dataDir] of PAIRS) {
  const sampleDir = dataDir ?? bundle;
  const data = JSON.parse(readFileSync(join(sampleDir, dataFile), "utf8"));
  const validate = validatorFor(schemaFile);
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
