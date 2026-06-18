import type { RawArtifact } from "../contracts/artifact.js";
import type { ParsedRecord } from "../contracts/canonical.js";
import type {
  Clock,
  CliffordConfig,
  IdProvider
} from "../contracts/plantModel.js";

export type AdapterContext = {
  clock: Clock;
  ids: IdProvider;
  config: CliffordConfig;
};

export type AdapterInput = {
  artifact: RawArtifact;
  bytes: Uint8Array;
  payload?: unknown;
};

export type AdapterResult = {
  records: ParsedRecord[];
  deferred_reason?: string;
};
