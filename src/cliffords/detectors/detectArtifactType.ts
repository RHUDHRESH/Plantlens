import { extname } from "node:path";
import type {
  ArtifactDetection,
  PreparedInput
} from "../contracts/artifact.js";
import { detectDocumentKind } from "./detectDocumentKind.js";

function looksBinary(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 1024));
  return sample.some((byte) => byte === 0);
}

function isOpcUaPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const record = payload as Record<string, unknown>;
  return (
    "EventType" in record ||
    "ConditionName" in record ||
    "ActiveState" in record
  );
}

export function detectArtifactType(input: PreparedInput): ArtifactDetection {
  const extension = (
    input.extension ??
    (input.original_filename ? extname(input.original_filename) : "")
  ).toLowerCase();
  const mime = input.mime_type?.toLowerCase();

  if (input.payload !== undefined) {
    if (isOpcUaPayload(input.payload)) {
      return {
        type: "opcua_event",
        confidence: 0.99,
        mime_type: "application/json",
        is_binary: false,
        supported: true
      };
    }
    return {
      type: "json_event",
      confidence: 0.95,
      mime_type: "application/json",
      is_binary: false,
      supported: true
    };
  }

  if (input.bytes.length >= 4) {
    const signature = Buffer.from(input.bytes.subarray(0, 4)).toString("hex");
    if (signature.startsWith("25504446") || extension === ".pdf") {
      return {
        type: "pid_document",
        confidence: 0.8,
        mime_type: mime ?? "application/pdf",
        is_binary: true,
        supported: false,
        reason: "PDF extraction is deferred in V1"
      };
    }
    if (
      signature.startsWith("89504e47") ||
      signature.startsWith("ffd8") ||
      [".png", ".jpg", ".jpeg", ".tif", ".tiff"].includes(extension)
    ) {
      return {
        type: "image_scan",
        confidence: 0.95,
        mime_type: mime ?? "application/octet-stream",
        is_binary: true,
        supported: false,
        reason: "OCR extraction is deferred in V1"
      };
    }
  }

  if (
    [".wav", ".mp3", ".m4a", ".ogg"].includes(extension) ||
    mime?.startsWith("audio/")
  ) {
    return {
      type: "audio_recording",
      confidence: 0.95,
      ...(mime ? { mime_type: mime } : {}),
      is_binary: true,
      supported: false,
      reason: "Audio transcription is deferred in V1"
    };
  }

  if ([".xlsx", ".xls"].includes(extension)) {
    return {
      type: "unknown",
      confidence: 0.9,
      ...(mime ? { mime_type: mime } : {}),
      is_binary: true,
      supported: true,
      reason: "Excel workbook routed to structured-table extraction"
    };
  }

  if (looksBinary(input.bytes)) {
    return {
      type: "unknown",
      confidence: 0.5,
      ...(mime ? { mime_type: mime } : {}),
      is_binary: true,
      supported: false,
      reason: "Unsupported binary payload"
    };
  }

  const text = Buffer.from(input.bytes).toString("utf8").trim();
  if (extension === ".json" || mime === "application/json") {
    try {
      const payload = JSON.parse(text) as unknown;
      if (isOpcUaPayload(payload)) {
        return {
          type: "opcua_event",
          confidence: 0.99,
          mime_type: "application/json",
          is_binary: false,
          supported: true
        };
      }
    } catch {
      // Parsing errors are reported by the JSON adapter with source context.
    }
    return {
      type: "json_event",
      confidence: 0.9,
      mime_type: "application/json",
      is_binary: false,
      supported: true
    };
  }
  if (
    [".csv", ".tsv"].includes(extension) ||
    /(?:,|;|\t|\|).*\r?\n/.test(text)
  ) {
    const documentKind = detectDocumentKind(text.split(/\r?\n/, 2)[0] ?? "");
    return {
      type:
        documentKind === "cause_effect_matrix" ||
        documentKind === "hazop_worksheet"
          ? documentKind
          : "alarm_csv",
      confidence: extension === ".csv" ? 0.95 : 0.82,
      mime_type: mime ?? "text/csv",
      is_binary: false,
      supported: true
    };
  }

  return {
    type: detectDocumentKind(text),
    confidence: text.length > 0 ? 0.8 : 0,
    mime_type: mime ?? "text/plain",
    is_binary: false,
    supported: true
  };
}
