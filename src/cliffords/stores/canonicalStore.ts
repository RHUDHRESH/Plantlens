import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { CanonicalRecord } from "../contracts/canonical.js";
import type { CanonicalStore } from "../contracts/plantModel.js";
import { atomicWrite, stableJson } from "./fileUtils.js";

export class FileCanonicalStore implements CanonicalStore {
  public constructor(private readonly baseDirectory: string) {}

  public async put(
    runId: string,
    records: CanonicalRecord[]
  ): Promise<void> {
    await atomicWrite(
      join(this.baseDirectory, "runs", runId, "canonical.json"),
      stableJson(records)
    );
  }

  public async getAll(): Promise<CanonicalRecord[]> {
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
    const records: CanonicalRecord[] = [];
    for (const entry of entries
      .filter((candidate) => candidate.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(runsDirectory, entry.name, "canonical.json");
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
        throw new TypeError(`Canonical run output is not an array: ${path}`);
      }
      records.push(...(parsed as CanonicalRecord[]));
    }
    return records;
  }
}

export class MemoryCanonicalStore implements CanonicalStore {
  private readonly records: CanonicalRecord[] = [];

  public async put(
    _runId: string,
    records: CanonicalRecord[]
  ): Promise<void> {
    this.records.push(...structuredClone(records));
  }

  public async getAll(): Promise<CanonicalRecord[]> {
    return structuredClone(this.records);
  }
}
