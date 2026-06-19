import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  CliffordConfig,
  ModelTemplates,
  PlantModel
} from "../cliffords/index.js";
import {
  compileModel,
  DEFAULT_CLIFFORD_CONFIG
} from "../cliffords/index.js";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as T;
}

export const demoTemplates = readJson<ModelTemplates>(
  "src/app/model/templates.json"
);
export const demoPlant = readJson<PlantModel>("src/app/model/plant.json");
export const demoCompiledModel = compileModel(demoPlant, demoTemplates);

export const demoTagRegistry = demoCompiledModel.tag_registry;
export const demoEquipmentRegistry = demoCompiledModel.equipment_registry;
export const demoZoneRegistry = demoCompiledModel.zone_registry;
export const demoArchetypeLibrary = demoCompiledModel.archetype_library;

export const demoCliffordConfig: CliffordConfig = {
  ...DEFAULT_CLIFFORD_CONFIG,
  data_directory: ".cliffords-data",
  signal_rules: demoCompiledModel.signal_rules
};
