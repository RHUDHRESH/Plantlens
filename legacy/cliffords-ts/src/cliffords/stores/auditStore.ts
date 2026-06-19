import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AuditStore } from "../contracts/plantModel.js";
import type {
  AuditChainVerification,
  AuditEvent,
  AuditEventInput
} from "../contracts/validation.js";
import { canonicalJson } from "./fileUtils.js";

const fileAppendQueues = new Map<string, Promise<void>>();

function eventDigest(event: Omit<AuditEvent, "event_hash">): string {
  return createHash("sha256").update(canonicalJson(event)).digest("hex");
}

function sealAuditEvent(
  input: AuditEventInput,
  previousEventHash: string | null
): AuditEvent {
  const unsigned: Omit<AuditEvent, "event_hash"> = {
    ...structuredClone(input),
    previous_event_hash: previousEventHash,
    hash_algorithm: "SHA-256"
  };
  return {
    ...unsigned,
    event_hash: eventDigest(unsigned)
  };
}

export function verifyAuditChain(
  events: AuditEvent[]
): AuditChainVerification {
  let previousHash: string | null = null;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    if (event.previous_event_hash !== previousHash) {
      return {
        valid: false,
        checked_events: index,
        broken_index: index,
        reason: "Audit event does not reference the previous event hash"
      };
    }
    const { event_hash: actualHash, ...unsigned } = event;
    const expectedHash = eventDigest(unsigned);
    if (actualHash !== expectedHash) {
      return {
        valid: false,
        checked_events: index,
        broken_index: index,
        reason: "Audit event hash does not match its contents"
      };
    }
    previousHash = actualHash;
  }
  return {
    valid: true,
    checked_events: events.length,
    broken_index: null,
    reason: null
  };
}

export class AuditIntegrityError extends Error {
  public constructor(public readonly verification: AuditChainVerification) {
    super(verification.reason ?? "Audit chain verification failed");
    this.name = "AuditIntegrityError";
  }
}

function assertValidAuditChain(events: AuditEvent[]): void {
  const verification = verifyAuditChain(events);
  if (!verification.valid) {
    throw new AuditIntegrityError(verification);
  }
}

export class FileAuditStore implements AuditStore {
  public constructor(private readonly baseDirectory: string) {}

  public append(event: AuditEventInput): Promise<void> {
    const path = this.auditPath();
    const previous = fileAppendQueues.get(path) ?? Promise.resolve();
    const operation = previous.then(() => this.appendInternal(event));
    fileAppendQueues.set(path, operation.catch(() => undefined));
    return operation;
  }

  private async appendInternal(event: AuditEventInput): Promise<void> {
    const path = join(this.baseDirectory, "audit", "events.jsonl");
    await mkdir(dirname(path), { recursive: true });
    const events = await this.readEvents();
    assertValidAuditChain(events);
    const previousHash = events.at(-1)?.event_hash ?? null;
    const sealed = sealAuditEvent(event, previousHash);
    await appendFile(path, `${canonicalJson(sealed)}\n`, "utf8");
  }

  public async getAll(): Promise<AuditEvent[]> {
    await (fileAppendQueues.get(this.auditPath()) ?? Promise.resolve());
    const events = await this.readEvents();
    assertValidAuditChain(events);
    return events;
  }

  private async readEvents(): Promise<AuditEvent[]> {
    const path = this.auditPath();
    const content = await readFile(path, "utf8").catch(
      (error: unknown) => {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          return "";
        }
        throw error;
      }
    );
    return content
      .split(/\r?\n/)
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as AuditEvent);
  }

  private auditPath(): string {
    return join(this.baseDirectory, "audit", "events.jsonl");
  }
}

export class MemoryAuditStore implements AuditStore {
  private readonly events: AuditEvent[] = [];

  public async append(event: AuditEventInput): Promise<void> {
    const previousHash = this.events.at(-1)?.event_hash ?? null;
    this.events.push(sealAuditEvent(event, previousHash));
  }

  public async getAll(): Promise<AuditEvent[]> {
    const events = structuredClone(this.events);
    assertValidAuditChain(events);
    return events;
  }
}
