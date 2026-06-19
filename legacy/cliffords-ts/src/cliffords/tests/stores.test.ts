import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AuditIntegrityError,
  FileAuditStore,
  verifyAuditChain
} from "../stores/auditStore.js";
import { FileQuarantineStore } from "../stores/quarantineStore.js";

describe("file stores", () => {
  it("reloads quarantine records and audit events after restart", async () => {
    const directory = await mkdtemp(join(process.cwd(), ".cliffords-store-"));
    try {
      await new FileQuarantineStore(directory).put("run_1", [
        {
          quarantine_id: "quarantine_1",
          artifact_id: "artifact_1",
          gate: "GATE_2_SCHEMA",
          severity: "HIGH",
          reason_code: "BAD_TIMESTAMP",
          reason_message: "Timestamp could not be normalized",
          raw_snapshot: { timestamp: "not-a-date" },
          created_at_utc: "2026-06-15T12:00:00.000Z",
          needs_human_review: true
        }
      ]);
      await new FileAuditStore(directory).append({
        event_id: "audit_1",
        run_id: "run_1",
        artifact_id: "artifact_1",
        occurred_at_utc: "2026-06-15T12:00:00.000Z",
        event_type: "RUN_STARTED",
        details: { input_kind: "file" }
      });

      const quarantine = await new FileQuarantineStore(directory).getAll();
      const audit = await new FileAuditStore(directory).getAll();

      expect(quarantine).toHaveLength(1);
      expect(quarantine[0]?.reason_code).toBe("BAD_TIMESTAMP");
      expect(audit).toHaveLength(1);
      expect(audit[0]?.event_type).toBe("RUN_STARTED");
      expect(verifyAuditChain(audit)).toMatchObject({
        valid: true,
        checked_events: 1
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("detects audit-log tampering after persistence", async () => {
    const directory = await mkdtemp(join(process.cwd(), ".cliffords-store-"));
    try {
      const store = new FileAuditStore(directory);
      await store.append({
        event_id: "audit_1",
        run_id: "run_1",
        occurred_at_utc: "2026-06-15T12:00:00.000Z",
        event_type: "RUN_STARTED",
        details: {}
      });
      const path = join(directory, "audit", "events.jsonl");
      const event = JSON.parse(await readFile(path, "utf8")) as Record<
        string,
        unknown
      >;
      event.event_type = "TAMPERED";
      await writeFile(path, `${JSON.stringify(event)}\n`, "utf8");

      await expect(new FileAuditStore(directory).getAll()).rejects.toBeInstanceOf(
        AuditIntegrityError
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("serializes concurrent audit appends across store instances", async () => {
    const directory = await mkdtemp(join(process.cwd(), ".cliffords-store-"));
    try {
      await Promise.all(
        Array.from({ length: 10 }, (_, index) =>
          new FileAuditStore(directory).append({
            event_id: `audit_${index}`,
            run_id: `run_${index}`,
            occurred_at_utc: "2026-06-15T12:00:00.000Z",
            event_type: "RUN_STARTED",
            details: { index }
          })
        )
      );

      const events = await new FileAuditStore(directory).getAll();
      expect(events).toHaveLength(10);
      expect(verifyAuditChain(events)).toMatchObject({
        valid: true,
        checked_events: 10
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
