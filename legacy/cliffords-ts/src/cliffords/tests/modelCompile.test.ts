import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  runCliffordsCycle,
  writeCompiledModelArtifacts
} from "../index.js";
import { gate3IndustrialTruth } from "../gates/gate3IndustrialTruth.js";
import {
  demoCliffordConfig,
  demoCompiledModel
} from "../../app/demoPlant.js";
import { createMemoryStores } from "../stores/index.js";
import { fixedClock, sequentialIds } from "./testContext.js";
import type { CanonicalAlarmEvent } from "../contracts/canonical.js";

function compiledContext() {
  return {
    plant_timezone: "Asia/Kolkata",
    tag_registry: demoCompiledModel.tag_registry,
    equipment_registry: demoCompiledModel.equipment_registry,
    zone_registry: demoCompiledModel.zone_registry,
    archetype_library: demoCompiledModel.archetype_library,
    config: demoCliffordConfig,
    stores: createMemoryStores(),
    clock: fixedClock("2026-06-15T12:00:00.000Z"),
    ids: sequentialIds()
  };
}

function alarm(value: number): CanonicalAlarmEvent {
  return {
    record_type: "alarm_event",
    event_id: "event_p101_temp",
    source_event_id: "opc-42",
    source_event_source: "ns=2;s=P-101",
    tag_id: "P101_TEMP_HIGH",
    equipment_id: "P-101",
    zone_id: null,
    timestamp_utc: "2026-06-15T04:30:00.000Z",
    received_at_utc: "2026-06-15T04:30:01.000Z",
    priority: 1,
    state: "ACTIVE",
    source_quality: "GOOD",
    process_value: value,
    engineering_unit: "degC",
    alarm_message: "Pump casing temperature high",
    source_system: "OPC-UA",
    source_type: "opcua_event",
    source_ref: { artifact_id: "artifact_model_test" },
    confidence: 0.99,
    metadata: {}
  };
}

describe("model compile", () => {
  it("derives Gate 3 registries from the authored plant and templates", () => {
    const tag = demoCompiledModel.tag_registry.P101_TEMP;

    expect(tag).toMatchObject({
      id: "P101_TEMP",
      equipment_id: "PUMP-P101",
      zone_id: "PUMP_ROOM_A",
      archetype_id: "centrifugal_pump",
      engineering_unit: "degC",
      alarm_high: 80
    });
    expect(tag?.aliases).toContain("P101_TEMP_HIGH");
    expect(demoCompiledModel.equipment_registry["PUMP-P101"]).toMatchObject({
      archetype_id: "centrifugal_pump",
      tag_prefix: "P101"
    });
    expect(demoCompiledModel.render_config.scene_nodes).toContainEqual(
      expect.objectContaining({
        equipment_id: "PUMP-P101",
        tag_ids: expect.arrayContaining(["P101_TEMP"])
      })
    );
  });

  it("lets a compiled alarm alias flow through the whole Cliffords run", async () => {
    const result = await runCliffordsCycle(
      {
        kind: "event",
        payload: {
          ConditionName: "P101_TEMP_HIGH",
          SourceName: "P-101",
          Severity: 850,
          ActiveState: true,
          Quality: "Good",
          Time: "2026-06-15T04:30:00.000Z",
          ReceiveTime: "2026-06-15T04:30:01.000Z",
          Value: 84,
          Unit: "degC",
          Message: "Pump casing temperature high",
          EventId: "opc-42"
        }
      },
      compiledContext()
    );

    expect(result.status).toBe("PASS");
    expect(result.clean_records[0]).toMatchObject({
      tag_id: "P101_TEMP",
      equipment_id: "PUMP-P101",
      zone_id: "PUMP_ROOM_A"
    });
    expect(result.mapping_requests).toHaveLength(0);
  });

  it("prefers exact compiled tag rules over generic signal rules", () => {
    const context = compiledContext();
    const config = {
      ...context.config,
      signal_rules: {
        ...context.config.signal_rules,
        temp: {
          allowed_units: ["degC"],
          min_value: -10,
          max_value: 81
        }
      }
    };

    const result = gate3IndustrialTruth(
      [alarm(84)],
      context.tag_registry,
      context.equipment_registry,
      context.zone_registry,
      context.archetype_library,
      config,
      [],
      context.clock,
      context.ids
    );

    expect(result.status).toBe("PASS");
  });

  it("dumps visible compiled model artifacts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "plantlens-model-"));

    await writeCompiledModelArtifacts(demoCompiledModel, directory);

    const tagRegistry = JSON.parse(
      await readFile(join(directory, "model", "tag_registry.json"), "utf8")
    ) as Record<string, unknown>;
    const renderConfig = JSON.parse(
      await readFile(join(directory, "model", "render_config.json"), "utf8")
    ) as { scene_nodes?: unknown[] };

    expect(tagRegistry).toHaveProperty("P101_TEMP");
    expect(renderConfig.scene_nodes?.length).toBeGreaterThan(0);
  });
});
