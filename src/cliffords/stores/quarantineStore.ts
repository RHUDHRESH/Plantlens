import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { QuarantineStore } from "../contracts/plantModel.js";
import type { QuarantineRecord } from "../contracts/quarantine.js";
import { atomicWrite, stableJson } from "./fileUtils.js";

export class FileQuarantineStore implements QuarantineStore {
  public constructor(private readonly baseDirectory: string) {}

  public async put(
    runId: string,
    records: QuarantineRecord[]
  ): Promise<void> {
    await atomicWrite(
      join(this.baseDirectory, "runs", runId, "quarantine.json"),
      stableJson(records)
    );
  }

  public async getAll(): Promise<QuarantineRecord[]> {
    const runsDirectory = join(this.baseDirectory, "runs");
    const entries = await readdir(runsDirectory, {
      withFileTypes: true
    }).catch((error: unknown) => {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return [];
      }
      throw error;
    });
    const records: QuarantineRecord[] = [];
    for (const entry of entries
      .filter((candidate) => candidate.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(runsDirectory, entry.name, "quarantine.json");
      const value = await readFile(path, "utf8").catch(
        (error: unknown) => {
          if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "ENOENT"
          ) {
            return null;
          }
          throw error;
        }
      );
      if (value === null) {
        continue;
      }
      const parsed = JSON.parse(value) as unknown;
      if (!Array.isArray(parsed)) {
        throw new TypeError(`Quarantine run output is not an array: ${path}`);
      }
      records.push(...(parsed as QuarantineRecord[]));
    }
    return records;
  }
}

export class MemoryQuarantineStore implements QuarantineStore {
  private readonly records: QuarantineRecord[] = [];

  public async put(
    _runId: string,
    records: QuarantineRecord[]
  ): Promise<void> {
    this.records.push(...structuredClone(records));
  }

  public async getAll(): Promise<QuarantineRecord[]> {
    return structuredClone(this.records);
  }
}
