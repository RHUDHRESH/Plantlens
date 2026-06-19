import { join } from "node:path";
import type { RunArtifactStore } from "../contracts/plantModel.js";
import { atomicWrite, stableJson } from "./fileUtils.js";

export class FileRunArtifactStore implements RunArtifactStore {
  public constructor(private readonly baseDirectory: string) {}

  public async writeRunOutput(
    runId: string,
    name:
      | "artifact"
      | "parsed"
      | "canonical"
      | "quarantine"
      | "mapping-requests"
      | "report",
    value: unknown
  ): Promise<void> {
    await atomicWrite(
      join(this.baseDirectory, "runs", runId, `${name}.json`),
      stableJson(value)
    );
  }
}

export class MemoryRunArtifactStore implements RunArtifactStore {
  public readonly outputs = new Map<string, unknown>();

  public async writeRunOutput(
    runId: string,
    name:
      | "artifact"
      | "parsed"
      | "canonical"
      | "quarantine"
      | "mapping-requests"
      | "report",
    value: unknown
  ): Promise<void> {
    this.outputs.set(`${runId}/${name}`, structuredClone(value));
  }
}
