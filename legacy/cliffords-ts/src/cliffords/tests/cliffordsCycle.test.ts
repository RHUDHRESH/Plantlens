import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { runCliffordsCycle } from "../index.js";
import { createTestContext } from "./testContext.js";

async function fixture(name: string): Promise<Buffer> {
  return readFile(new URL(`../fixtures/${name}`, import.meta.url));
}

describe("runCliffordsCycle", () => {
  it("passes a good alarm CSV through all three gates", async () => {
    const { context, stores } = createTestContext();
    const bytes = await fixture("sample_alarm_history.csv");

    const result = await runCliffordsCycle(
      {
        kind: "file",
        filename: "sample_alarm_history.csv",
        bytes
      },
      context
    );

    expect(result.status).toBe("PASS");
    expect(result.clean_records).toHaveLength(5);
    expect(result.quarantined_records).toHaveLength(0);
    expect(result.report.downstream_ready).toBe(true);
    expect(
      result.clean_records.every(
        (record) =>
          record.record_type === "alarm_event" &&
          record.timestamp_utc.endsWith("Z") &&
          record.priority >= 1 &&
          record.priority <= 4 &&
          record.source_ref.row_number !== undefined
      )
    ).toBe(true);
    expect(stores.raw.size).toBe(1);
    expect(stores.runs.outputs.has(`${result.run_id}/report`)).toBe(true);
  });

  it("quarantines every invalid field and unknown mapping", async () => {
    const { context } = createTestContext();
    const bytes = await fixture("sample_bad_alarm_history.csv");

    const result = await runCliffordsCycle(
      {
        kind: "file",
        filename: "sample_bad_alarm_history.csv",
        bytes
      },
      context
    );

    const reasonCodes = result.quarantined_records.map(
      (record) => record.reason_code
    );
    expect(["PARTIAL", "FAIL"]).toContain(result.status);
    expect(result.quarantined_records.length).toBeGreaterThanOrEqual(2);
    expect(reasonCodes).toEqual(
      expect.arrayContaining(["BAD_TIMESTAMP", "BAD_PRIORITY", "UNKNOWN_TAG"])
    );
    expect(result.mapping_requests.some((request) => request.issue === "UNKNOWN_TAG")).toBe(true);
  });

  it("supports paste input without promoting contextual text downstream", async () => {
    const { context } = createTestContext();
    const text = (await fixture("sample_operator_note.txt")).toString("utf8");

    const result = await runCliffordsCycle(
      { kind: "paste", text },
      context
    );

    expect(result.artifact.detected_type).toBe("operator_note");
    expect(
      result.parsed_records.some(
        (record) =>
          record.record_kind === "equipment_candidate" &&
          record.fields.equipment_id === "PV-101"
      )
    ).toBe(true);
    expect(
      result.parsed_records.some(
        (record) =>
          record.record_kind === "causal_edge_candidate" &&
          record.confidence < 0.98
      )
    ).toBe(true);
    expect(result.clean_records).toHaveLength(0);
  });

  it("supports JSON and event inputs", async () => {
    const jsonRun = createTestContext();
    const jsonResult = await runCliffordsCycle(
      {
        kind: "json",
        payload: {
          tag_id: "PV101_CURRENT_LOW",
          equipment_id: "PV-101",
          timestamp: "2026-06-15T10:00:04+05:30",
          priority: "HIGH",
          state: "ACTIVE",
          value: 1.2,
          unit: "A",
          message: "PV current low"
        }
      },
      jsonRun.context
    );
    expect(jsonResult.status).toBe("PASS");

    const eventRun = createTestContext();
    const payload = JSON.parse(
      (await fixture("sample_opcua_event.json")).toString("utf8")
    ) as unknown;
    const eventResult = await runCliffordsCycle(
      { kind: "event", payload },
      eventRun.context
    );
    expect(eventResult.status).toBe("PASS");
    expect(eventResult.clean_records[0]).toMatchObject({
      record_type: "alarm_event",
      tag_id: "PV101_CURRENT_LOW",
      equipment_id: "PV-101",
      priority: 2,
      state: "ACTIVE"
    });

    const uploadedRun = createTestContext();
    const uploadedResult = await runCliffordsCycle(
      {
        kind: "file",
        filename: "sample_opcua_event.json",
        bytes: await fixture("sample_opcua_event.json")
      },
      uploadedRun.context
    );
    expect(uploadedResult.artifact.detected_type).toBe("opcua_event");
    expect(uploadedResult.status).toBe("PASS");
  });

  it("ingests Excel alarm sheets with cell-level provenance", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      [
        "Timestamp",
        "TagName",
        "Priority",
        "State",
        "Value",
        "Unit",
        "Message"
      ],
      [
        "2026-06-15 10:00:04",
        "PV101_CURRENT_LOW",
        "HIGH",
        "ACTIVE",
        1.2,
        "A",
        "PV string current low"
      ]
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Alarm History");
    const bytes = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx"
    }) as Buffer;
    const { context } = createTestContext();

    const result = await runCliffordsCycle(
      {
        kind: "file",
        filename: "alarm_history.xlsx",
        bytes
      },
      context
    );

    expect(result.status).toBe("PASS");
    expect(result.clean_records).toHaveLength(1);
    expect(result.clean_records[0]?.source_ref).toMatchObject({
      row_number: 2,
      cell_ref: "'Alarm History'!A2:G2"
    });
  });

  it("normalizes a CloudEvent into a canonical alarm", async () => {
    const { context } = createTestContext();
    const result = await runCliffordsCycle(
      {
        kind: "json",
        payload: {
          specversion: "1.0",
          id: "event-123",
          source: "urn:plant:plc-1",
          type: "com.plantlens.alarm.raised",
          time: "2026-06-15T10:00:04+05:30",
          data: {
            tag_id: "PV101_CURRENT_LOW",
            equipment_id: "PV-101",
            priority: "HIGH",
            state: "ACTIVE",
            value: 1.2,
            unit: "A",
            quality: "Good"
          }
        }
      },
      context
    );

    expect(result.status).toBe("PASS");
    expect(result.clean_records[0]).toMatchObject({
      record_type: "alarm_event",
      source_event_id: "event-123",
      source_event_source: "urn:plant:plc-1",
      source_quality: "GOOD"
    });
  });

  it("accepts canonical CSV headers and OPC-style exported values", async () => {
    const { context } = createTestContext();
    const csv = [
      "timestamp,received_at,source_event_id,source_event_source,tag_id,equipment_id,severity,active_state,process_value,engineering_unit,message",
      "2026-06-15T04:30:00.000Z,2026-06-15T04:30:01.000Z,csv-42,urn:csv-export,PV101_CURRENT_LOW,PV-101,850,TRUE,1.2,A,PV current low"
    ].join("\n");

    const result = await runCliffordsCycle(
      {
        kind: "file",
        filename: "canonical_alarm_export.csv",
        bytes: Buffer.from(csv, "utf8")
      },
      context
    );

    expect(result.status).toBe("PASS");
    expect(result.clean_records[0]).toMatchObject({
      record_type: "alarm_event",
      source_event_id: "csv-42",
      source_event_source: "urn:csv-export",
      tag_id: "PV101_CURRENT_LOW",
      priority: 1,
      state: "ACTIVE"
    });
  });

  it("quarantines artifacts that exceed the parsed-record ceiling", async () => {
    const { context } = createTestContext();
    context.config = {
      ...context.config,
      max_parsed_records: 1
    };

    const result = await runCliffordsCycle(
      {
        kind: "file",
        filename: "sample_alarm_history.csv",
        bytes: await fixture("sample_alarm_history.csv")
      },
      context
    );

    expect(result.status).toBe("FAIL");
    expect(result.quarantined_records.map((record) => record.reason_code)).toContain(
      "RECORD_LIMIT_EXCEEDED"
    );
  });

  it("rejects JSON payloads beyond the configured nesting depth", async () => {
    const { context } = createTestContext();
    context.config = {
      ...context.config,
      max_json_depth: 2
    };

    const result = await runCliffordsCycle(
      {
        kind: "json",
        payload: {
          tag_id: "PV101_CURRENT_LOW",
          nested: { level_2: { level_3: true } }
        }
      },
      context
    );

    expect(result.status).toBe("FAIL");
    expect(result.quarantined_records.map((record) => record.reason_code)).toContain(
      "JSON_DEPTH_EXCEEDED"
    );
  });

  it("quarantines extracted records with oversized text fields", async () => {
    const { context } = createTestContext();
    context.config = {
      ...context.config,
      max_text_field_chars: 16
    };

    const result = await runCliffordsCycle(
      {
        kind: "file",
        filename: "sample_alarm_history.csv",
        bytes: await fixture("sample_alarm_history.csv")
      },
      context
    );

    expect(result.status).toBe("FAIL");
    expect(result.quarantined_records.map((record) => record.reason_code)).toContain(
      "TEXT_FIELD_TOO_LARGE"
    );
  });
});
