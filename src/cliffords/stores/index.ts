import { resolve } from "node:path";
import type { CliffordStores } from "../contracts/plantModel.js";
import {
  AuditIntegrityError,
  FileAuditStore,
  MemoryAuditStore,
  verifyAuditChain
} from "./auditStore.js";
import {
  FileCanonicalStore,
  MemoryCanonicalStore
} from "./canonicalStore.js";
import {
  FileQuarantineStore,
  MemoryQuarantineStore
} from "./quarantineStore.js";
import {
  FileRawArtifactStore,
  MemoryRawArtifactStore
} from "./rawArtifactStore.js";
import {
  FileRunArtifactStore,
  MemoryRunArtifactStore
} from "./runArtifactStore.js";

export function createFileStores(
  dataDirectory = resolve(".cliffords-data")
): CliffordStores {
  return {
    raw: new FileRawArtifactStore(dataDirectory),
    canonical: new FileCanonicalStore(dataDirectory),
    quarantine: new FileQuarantineStore(dataDirectory),
    audit: new FileAuditStore(dataDirectory),
    runs: new FileRunArtifactStore(dataDirectory)
  };
}

export function createMemoryStores(): CliffordStores & {
  raw: MemoryRawArtifactStore;
  canonical: MemoryCanonicalStore;
  quarantine: MemoryQuarantineStore;
  audit: MemoryAuditStore;
  runs: MemoryRunArtifactStore;
} {
  return {
    raw: new MemoryRawArtifactStore(),
    canonical: new MemoryCanonicalStore(),
    quarantine: new MemoryQuarantineStore(),
    audit: new MemoryAuditStore(),
    runs: new MemoryRunArtifactStore()
  };
}

export {
  AuditIntegrityError,
  FileAuditStore,
  FileCanonicalStore,
  FileQuarantineStore,
  FileRawArtifactStore,
  FileRunArtifactStore,
  MemoryAuditStore,
  MemoryCanonicalStore,
  MemoryQuarantineStore,
  MemoryRawArtifactStore,
  MemoryRunArtifactStore,
  verifyAuditChain
};
