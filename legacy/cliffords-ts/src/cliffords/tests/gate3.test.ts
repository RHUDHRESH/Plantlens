import { describe, expect, it } from "vitest";
import type {
  CanonicalAlarmEvent,
  CanonicalCausalEdgeCandidate
} from "../contracts/canonical.js";
import { gate3IndustrialTruth } from "../gates/gate3IndustrialTruth.js";
import { suggestEquipmentMatches } from "../mapping/equipmentResolver.js";
import { suggestTagMatches } from "../mapping/tagResolver.js";
import { createTestContext } from "./testContext.js";

function alarm(tagId: string): CanonicalAlarmEvent {
  return {
    record_type: "alarm_event",
    event_id: `event_${tagId}`,
    source_event_id: null,
    source_event_source: null,
    tag_id: tagId,
    equipment_id: null,
    zone_id: null,
    timestamp_utc: "2026-06-15T04:30:04.000Z",
    received_at_utc: "2026-06-15T12:00:00.000Z",
    priority: 2,
    state: "ACTIVE",
    source_quality: "GOOD",
    process_value: 1.2,
    engineering_unit: "A",
    alarm_message: "Current low",
    source_system: null,
    source_type: "alarm_csv",
    source_ref: { artifact_id: "artifact_test", row_number: 2 },
    confidence: 0.98,
    metadata: {}
  };
}

describe("Gate 3", () => {
  it("passes a resolved record and fills registry mappings", () => {
    const { context } = createTestContext();
    const result = gate3IndustrialTruth(
      [alarm("PV101_CURRENT_LOW")],
      context.tag_registry,
      context.equipment_registry,
      context.zone_registry,
      context.archetype_library,
      context.config,
      [],
      context.clock!,
      context.ids!
    );

    expect(result.status).toBe("PASS");
    expect(result.clean_records[0]).toMatchObject({
      equipment_id: "PV-101",
      zone_id: "ZONE-PV"
    });
  });

  it("quarantines unknown tags and creates a mapping request", () => {
    const { context } = createTestContext();
    const result = gate3IndustrialTruth(
      [alarm("UNKNOWN_TAG")],
      context.tag_registry,
      context.equipment_registry,
      context.zone_registry,
      context.archetype_library,
      context.config,
      [],
      context.clock!,
      context.ids!
    );

    expect(result.status).toBe("FAIL");
    expect(result.quarantined_records[0]?.reason_code).toBe("UNKNOWN_TAG");
    expect(result.mapping_requests[0]).toMatchObject({
      issue: "UNKNOWN_TAG",
      status: "OPEN"
    });
  });

  it("rejects a resolved zone that conflicts with the tag registry", () => {
    const { context } = createTestContext();
    const input = alarm("PV101_CURRENT_LOW");
    input.zone_id = "ZONE-POWER";

    const result = gate3IndustrialTruth(
      [input],
      context.tag_registry,
      context.equipment_registry,
      context.zone_registry,
      context.archetype_library,
      context.config,
      [],
      context.clock!,
      context.ids!
    );

    expect(result.clean_records).toHaveLength(0);
    expect(result.quarantined_records.map((record) => record.reason_code)).toContain(
      "TOPOLOGY_CONFLICT"
    );
  });

  it("normalizes configured unit aliases before comparing them", () => {
    const { context } = createTestContext();
    const config = {
      ...context.config,
      signal_rules: {
        ...context.config.signal_rules,
        current: {
          ...context.config.signal_rules?.current,
          allowed_units: ["amps"]
        }
      }
    };

    const result = gate3IndustrialTruth(
      [alarm("PV101_CURRENT_LOW")],
      context.tag_registry,
      context.equipment_registry,
      context.zone_registry,
      context.archetype_library,
      config,
      [],
      context.clock!,
      context.ids!
    );

    expect(result.status).toBe("PASS");
    expect(result.quarantined_records).toHaveLength(0);
  });

  it("rejects bad source quality before downstream use", () => {
    const { context } = createTestContext();
    const input = alarm("PV101_CURRENT_LOW");
    input.source_quality = "BAD";

    const result = gate3IndustrialTruth(
      [input],
      context.tag_registry,
      context.equipment_registry,
      context.zone_registry,
      context.archetype_library,
      context.config,
      [],
      context.clock!,
      context.ids!
    );

    expect(result.clean_records).toHaveLength(0);
    expect(result.quarantined_records.map((record) => record.reason_code)).toContain(
      "SOURCE_QUALITY_BAD"
    );
  });

  it("deduplicates by producer and source event ID", () => {
    const { context } = createTestContext();
    const previous = alarm("PV101_CURRENT_LOW");
    previous.source_event_id = "event-from-plc-42";
    previous.source_event_source = "urn:plc:line-1";
    previous.timestamp_utc = "2026-06-15T03:00:00.000Z";
    const candidate = alarm("PV101_CURRENT_LOW");
    candidate.source_event_id = "event-from-plc-42";
    candidate.source_event_source = "urn:plc:line-1";

    const result = gate3IndustrialTruth(
      [candidate],
      context.tag_registry,
      context.equipment_registry,
      context.zone_registry,
      context.archetype_library,
      context.config,
      [previous],
      context.clock!,
      context.ids!
    );

    expect(result.clean_records).toHaveLength(0);
    expect(result.quarantined_records.map((record) => record.reason_code)).toContain(
      "DUPLICATE_EVENT"
    );
  });

  it("never approves proposed causal edges automatically", () => {
    const { context } = createTestContext();
    const edge: CanonicalCausalEdgeCandidate = {
      record_type: "causal_edge_candidate",
      edge_candidate_id: "edge_1",
      cause_tag_id: "PV101_CURRENT_LOW",
      effect_tag_id: "MPPT101_POWER_LIMIT",
      cause_equipment_id: null,
      effect_equipment_id: null,
      min_delay_sec: 2,
      max_delay_sec: 20,
      edge_kind: "unknown",
      evidence_source: "cause_effect_matrix",
      source_ref: { artifact_id: "artifact_test", row_number: 2 },
      confidence: 0.96,
      approval_status: "PROPOSED",
      metadata: {}
    };

    const result = gate3IndustrialTruth(
      [edge],
      context.tag_registry,
      context.equipment_registry,
      context.zone_registry,
      context.archetype_library,
      context.config,
      [],
      context.clock!,
      context.ids!
    );

    expect(result.clean_records).toHaveLength(0);
    expect(result.quarantined_records[0]?.reason_code).toBe(
      "UNAPPROVED_CAUSAL_EDGE"
    );
  });

  it("uses registry aliases when ranking mapping suggestions", () => {
    const tagMatches = suggestTagMatches("P101_TEMP_HI", {
      P101_TEMP: {
        id: "P101_TEMP",
        aliases: ["P101_TEMP_HIGH"]
      }
    });
    const equipmentMatches = suggestEquipmentMatches("Pump P101", {
      "PUMP-P101": {
        id: "PUMP-P101",
        aliases: ["Pump P-101"]
      }
    });

    expect(tagMatches[0]).toMatchObject({ id: "P101_TEMP" });
    expect(equipmentMatches[0]).toMatchObject({ id: "PUMP-P101" });
  });
});
