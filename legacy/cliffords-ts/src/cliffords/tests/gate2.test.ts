import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseCsvAlarm } from "../adapters/csvAlarmAdapter.js";
import type {
  ArtifactType,
  RawArtifact
} from "../contracts/artifact.js";
import { gate2CanonicalSchema } from "../gates/gate2CanonicalSchema.js";
import { createTestContext } from "./testContext.js";

async function parsedFixture(
  name: string,
  detectedType: ArtifactType
) {
  const { context } = createTestContext();
  const bytes = await readFile(new URL(`../fixtures/${name}`, import.meta.url));
  const artifact: RawArtifact = {
    artifact_id: "artifact_test",
    received_at_utc: context.clock!.now().toISOString(),
    original_filename: name,
    extension: ".csv",
    mime_type: "text/csv",
    size_bytes: bytes.length,
    sha256: "a".repeat(64),
    source_channel: "upload",
    raw_uri: "memory://raw/test",
    detected_type: detectedType,
    detection_confidence: 1,
    metadata: {}
  };
  const adapterContext = {
    clock: context.clock!,
    ids: context.ids!,
    config: context.config
  };
  return {
    context,
    artifact,
    records: parseCsvAlarm({ artifact, bytes }, adapterContext).records
  };
}

describe("Gate 2", () => {
  it("emits separate timestamp and priority reasons for a bad row", async () => {
    const { context, artifact, records } = await parsedFixture(
      "sample_bad_alarm_history.csv",
      "alarm_csv"
    );

    const result = gate2CanonicalSchema(
      records,
      artifact,
      context.plant_timezone,
      context.config,
      context.clock!,
      context.ids!
    );

    expect(result.quarantined_records.map((record) => record.reason_code)).toEqual(
      expect.arrayContaining(["BAD_TIMESTAMP", "BAD_PRIORITY"])
    );
  });

  it("canonicalizes cause/effect rows as proposed edges", async () => {
    const { context, artifact, records } = await parsedFixture(
      "sample_cause_effect_matrix.csv",
      "cause_effect_matrix"
    );

    const result = gate2CanonicalSchema(
      records,
      artifact,
      context.plant_timezone,
      context.config,
      context.clock!,
      context.ids!
    );

    expect(result.status).toBe("PASS");
    expect(result.canonical_records).toHaveLength(4);
    expect(
      result.canonical_records.every(
        (record) =>
          record.record_type === "causal_edge_candidate" &&
          record.approval_status === "PROPOSED" &&
          record.source_ref.row_number !== undefined
      )
    ).toBe(true);
  });

  it("carries the raw artifact digest into canonical provenance", async () => {
    const { context, artifact, records } = await parsedFixture(
      "sample_alarm_history.csv",
      "alarm_csv"
    );

    const result = gate2CanonicalSchema(
      records.slice(0, 1),
      artifact,
      context.plant_timezone,
      context.config,
      context.clock!,
      context.ids!
    );

    expect(result.canonical_records[0]).toMatchObject({
      source_event_id: null,
      source_quality: "UNKNOWN",
      received_at_utc: artifact.received_at_utc,
      source_ref: {
        artifact_id: artifact.artifact_id,
        artifact_sha256: artifact.sha256
      }
    });
  });

  it("rejects inverted causal delay ranges", async () => {
    const { context, artifact, records } = await parsedFixture(
      "sample_cause_effect_matrix.csv",
      "cause_effect_matrix"
    );
    records[0]!.fields.min_delay_sec = 20;
    records[0]!.fields.max_delay_sec = 2;

    const result = gate2CanonicalSchema(
      records.slice(0, 1),
      artifact,
      context.plant_timezone,
      context.config,
      context.clock!,
      context.ids!
    );

    expect(result.quarantined_records.map((record) => record.reason_code)).toContain(
      "INVALID_DELAY_RANGE"
    );
  });
});
