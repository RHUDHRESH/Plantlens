import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type {
  RawArtifactStore,
  RawStoreResult
} from "../contracts/plantModel.js";
import { atomicWrite } from "./fileUtils.js";

export class FileRawArtifactStore implements RawArtifactStore {
  public constructor(private readonly baseDirectory: string) {}

  public async put(
    sha256: string,
    bytes: Uint8Array
  ): Promise<RawStoreResult> {
    const path = join(this.baseDirectory, "raw", sha256);
    const duplicate = await stat(path)
      .then(() => true)
      .catch(() => false);
    if (!duplicate) {
      await atomicWrite(path, bytes);
    }
    return { uri: path, duplicate };
  }

  public async get(sha256: string): Promise<Uint8Array | null> {
    const path = join(this.baseDirectory, "raw", sha256);
    return readFile(path).catch(() => null);
  }
}

export class MemoryRawArtifactStore implements RawArtifactStore {
  private readonly values = new Map<string, Uint8Array>();

  public async put(
    sha256: string,
    bytes: Uint8Array
  ): Promise<RawStoreResult> {
    const duplicate = this.values.has(sha256);
    if (!duplicate) {
      this.values.set(sha256, Uint8Array.from(bytes));
    }
    return { uri: `memory://raw/${sha256}`, duplicate };
  }

  public async get(sha256: string): Promise<Uint8Array | null> {
    const value = this.values.get(sha256);
    return value ? Uint8Array.from(value) : null;
  }

  public get size(): number {
    return this.values.size;
  }
}
