import { createHash } from "node:crypto";
import { extname } from "node:path";
import type {
  CliffordInput,
  PreparedInput,
  RawArtifact
} from "../contracts/artifact.js";
import type {
  Clock,
  CliffordConfig,
  IdProvider,
  RawArtifactStore
} from "../contracts/plantModel.js";
import type { Gate1Result } from "../contracts/validation.js";
import { detectArtifactType } from "../detectors/detectArtifactType.js";
import { createQuarantineRecord } from "../quarantine.js";

function serializePayload(payload: unknown): Uint8Array {
  return Buffer.from(JSON.stringify(payload), "utf8");
}

function prepareInput(input: CliffordInput): PreparedInput {
  switch (input.kind) {
    case "file": {
      const prepared: PreparedInput = {
        bytes: Uint8Array.from(input.bytes),
        source_channel: "upload",
        original_filename: input.filename,
        extension: extname(input.filename).toLowerCase()
      };
      if (input.mime_type !== undefined) {
        prepared.mime_type = input.mime_type;
      }
      return prepared;
    }
    case "paste":
      return {
        bytes: Buffer.from(input.text, "utf8"),
        source_channel: "paste",
        mime_type: "text/plain",
        extension: ".txt"
      };
    case "json":
      return {
        bytes: serializePayload(input.payload),
        source_channel: "api",
        mime_type: "application/json",
        extension: ".json",
        payload: input.payload
      };
    case "event":
      return {
        bytes: serializePayload(input.payload),
        source_channel: "opcua",
        mime_type: "application/json",
        extension: ".json",
        payload: input.payload
      };
  }
}

function blankArtifact(
  artifactId: string,
  clock: Clock,
  prepared?: PreparedInput
): RawArtifact {
  const artifact: RawArtifact = {
    artifact_id: artifactId,
    received_at_utc: clock.now().toISOString(),
    size_bytes: prepared?.bytes.length ?? 0,
    sha256: "",
    source_channel: prepared?.source_channel ?? "manual",
    raw_uri: "",
    metadata: {}
  };
  if (prepared?.original_filename !== undefined) {
    artifact.original_filename = prepared.original_filename;
  }
  if (prepared?.mime_type !== undefined) {
    artifact.mime_type = prepared.mime_type;
  }
  if (prepared?.extension !== undefined) {
    artifact.extension = prepared.extension;
  }
  return artifact;
}

function failure(
  artifact: RawArtifact,
  reasonCode: string,
  message: string,
  clock: Clock,
  ids: IdProvider,
  snapshot: unknown
): Gate1Result {
  return {
    status: "FAIL",
    artifact,
    quarantine: createQuarantineRecord(
      {
        artifact_id: artifact.artifact_id,
        gate: "GATE_1_ARTIFACT",
        severity: "BLOCKER",
        reason_code: reasonCode,
        reason_message: message,
        raw_snapshot: snapshot
      },
      clock,
      ids
    )
  };
}

export async function gate1ArtifactIntegrity(
  input: CliffordInput,
  config: CliffordConfig,
  store: RawArtifactStore,
  clock: Clock,
  ids: IdProvider
): Promise<Gate1Result> {
  const artifactId = ids.next("artifact");
  let prepared: PreparedInput;
  try {
    prepared = prepareInput(input);
  } catch (error) {
    const artifact = blankArtifact(artifactId, clock);
    return failure(
      artifact,
      "UNREADABLE_PAYLOAD",
      error instanceof Error ? error.message : "Payload could not be serialized",
      clock,
      ids,
      null
    );
  }

  const artifact = blankArtifact(artifactId, clock, prepared);
  if (prepared.bytes.length === 0) {
    return failure(
      artifact,
      "EMPTY_INPUT",
      "The input contains no data",
      clock,
      ids,
      null
    );
  }
  if (prepared.bytes.length > config.max_artifact_size_bytes) {
    return failure(
      artifact,
      "FILE_TOO_LARGE",
      `Input size ${prepared.bytes.length} exceeds ${config.max_artifact_size_bytes} bytes`,
      clock,
      ids,
      { size_bytes: prepared.bytes.length }
    );
  }

  try {
    artifact.sha256 = createHash("sha256")
      .update(prepared.bytes)
      .digest("hex");
  } catch (error) {
    return failure(
      artifact,
      "HASH_FAILED",
      error instanceof Error ? error.message : "SHA-256 hashing failed",
      clock,
      ids,
      null
    );
  }

  try {
    const stored = await store.put(artifact.sha256, prepared.bytes);
    artifact.raw_uri = stored.uri;
    artifact.metadata.raw_duplicate = stored.duplicate;
  } catch (error) {
    return failure(
      artifact,
      "RAW_STORE_FAILED",
      error instanceof Error ? error.message : "Raw artifact storage failed",
      clock,
      ids,
      { sha256: artifact.sha256 }
    );
  }

  try {
    const storedBytes = await store.get(artifact.sha256);
    const storedHash = storedBytes
      ? createHash("sha256").update(storedBytes).digest("hex")
      : null;
    if (storedHash !== artifact.sha256) {
      return failure(
        artifact,
        "RAW_STORE_INTEGRITY_FAILED",
        "Stored raw artifact could not be verified against its SHA-256 digest",
        clock,
        ids,
        {
          expected_sha256: artifact.sha256,
          stored_sha256: storedHash,
          raw_uri: artifact.raw_uri
        }
      );
    }
    artifact.metadata.raw_store_verified = true;
  } catch (error) {
    return failure(
      artifact,
      "RAW_STORE_INTEGRITY_FAILED",
      error instanceof Error
        ? error.message
        : "Stored raw artifact verification failed",
      clock,
      ids,
      {
        expected_sha256: artifact.sha256,
        raw_uri: artifact.raw_uri
      }
    );
  }

  const detection = detectArtifactType(prepared);
  artifact.detected_type = detection.type;
  artifact.detection_confidence = detection.confidence;
  artifact.metadata.is_binary = detection.is_binary;
  artifact.metadata.detection_reason = detection.reason ?? null;
  if (!artifact.mime_type && detection.mime_type) {
    artifact.mime_type = detection.mime_type;
  }

  if (!detection.supported && detection.is_binary) {
    return failure(
      artifact,
      "UNSUPPORTED_BINARY",
      detection.reason ?? "The binary payload is not supported",
      clock,
      ids,
      {
        sha256: artifact.sha256,
        detected_type: detection.type,
        raw_uri: artifact.raw_uri
      }
    );
  }

  return { status: "PASS", artifact, bytes: prepared.bytes };
}
