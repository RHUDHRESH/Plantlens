import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseOpcuaEvent } from "../adapters/opcuaEventAdapter.js";
import { parseJsonEvent } from "../adapters/jsonEventAdapter.js";
import { transcribeAudio } from "../adapters/audioTranscriptAdapter.js";
import { runOcrIfNeeded } from "../adapters/imageOcrAdapter.js";
import { extractDocumentText } from "../adapters/pdfDocumentAdapter.js";
import { parseTextNote } from "../adapters/textNoteAdapter.js";
import type {
  ArtifactType,
  RawArtifact
} from "../contracts/artifact.js";
import { createTestContext } from "./testContext.js";

function artifact(
  detectedType: ArtifactType,
  sizeBytes: number
): RawArtifact {
  return {
    artifact_id: "artifact_adapter",
    received_at_utc: "2026-06-15T12:00:00.000Z",
    size_bytes: sizeBytes,
    sha256: "b".repeat(64),
    source_channel: "upload",
    raw_uri: "memory://raw/adapter",
    detected_type: detectedType,
    detection_confidence: 1,
    metadata: {}
  };
}

describe("adapters", () => {
  it("extracts equipment and a lower-confidence sequence from notes", async () => {
    const { context } = createTestContext();
    const bytes = await readFile(
      new URL("../fixtures/sample_operator_note.txt", import.meta.url)
    );
    const result = parseTextNote(
      { artifact: artifact("operator_note", bytes.length), bytes },
      {
        clock: context.clock!,
        ids: context.ids!,
        config: context.config
      }
    );

    expect(
      result.records.some(
        (record) =>
          record.record_kind === "equipment_candidate" &&
          record.fields.equipment_id === "PV-101"
      )
    ).toBe(true);
    expect(
      result.records.some(
        (record) =>
          record.record_kind === "causal_edge_candidate" &&
          record.confidence < 0.98
      )
    ).toBe(true);
  });

  it("normalizes OPC-UA field semantics without discarding ack state", async () => {
    const { context } = createTestContext();
    const bytes = await readFile(
      new URL("../fixtures/sample_opcua_event.json", import.meta.url)
    );
    const payload = JSON.parse(bytes.toString("utf8")) as unknown;
    Object.assign(payload as Record<string, unknown>, {
      EventId: [1, 2, 3, 4],
      SourceNode: "ns=2;s=PV-101",
      ReceiveTime: "2026-06-15T10:00:05+05:30",
      Quality: "Good",
      Retain: true,
      BranchId: null
    });
    const result = parseOpcuaEvent(
      {
        artifact: artifact("opcua_event", bytes.length),
        bytes,
        payload
      },
      {
        clock: context.clock!,
        ids: context.ids!,
        config: context.config
      }
    );

    expect(result.records[0]?.fields).toMatchObject({
      tag_id: "PV101_CURRENT_LOW",
      equipment_id: "PV-101",
      priority: 2,
      state: "ACTIVE",
      source_event_id: [1, 2, 3, 4],
      source_event_source: "ns=2;s=PV-101",
      source_quality: "Good",
      acked_state: false,
      active_state: true,
      retain: true
    });
  });

  it("unwraps CloudEvents while preserving producer identity", () => {
    const { context } = createTestContext();
    const payload = {
      specversion: "1.0",
      id: "event-123",
      source: "urn:plant:plc-1",
      type: "com.plantlens.alarm.raised",
      time: "2026-06-15T10:00:04+05:30",
      subject: "PV101_CURRENT_LOW",
      data: {
        tag_id: "PV101_CURRENT_LOW",
        equipment_id: "PV-101",
        priority: "HIGH",
        state: "ACTIVE",
        value: 1.2,
        unit: "A",
        quality: "Good"
      }
    };
    const bytes = Buffer.from(JSON.stringify(payload));
    const result = parseJsonEvent(
      {
        artifact: artifact("json_event", bytes.length),
        bytes,
        payload
      },
      {
        clock: context.clock!,
        ids: context.ids!,
        config: context.config
      }
    );

    expect(result.records[0]).toMatchObject({
      source_ref: { json_pointer: "/data" },
      fields: {
        source_event_id: "event-123",
        source_event_source: "urn:plant:plc-1",
        cloud_event_specversion: "1.0",
        cloud_event_type: "com.plantlens.alarm.raised"
      }
    });
  });

  it("exposes explicit deferred contracts for replaceable extractors", () => {
    const bytes = Buffer.from("placeholder");
    const input = {
      artifact: artifact("unknown", bytes.length),
      bytes
    };

    expect(extractDocumentText(input)).toMatchObject({
      status: "DEFERRED",
      pages: []
    });
    expect(runOcrIfNeeded(input)).toMatchObject({
      status: "DEFERRED",
      text: ""
    });
    expect(transcribeAudio(input)).toMatchObject({
      status: "DEFERRED",
      spans: []
    });
  });
});
