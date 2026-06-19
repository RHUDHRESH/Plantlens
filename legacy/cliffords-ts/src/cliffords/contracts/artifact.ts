export type ArtifactType =
  | "alarm_csv"
  | "historian_csv"
  | "cause_effect_matrix"
  | "hazop_worksheet"
  | "pid_document"
  | "maintenance_record"
  | "permit_to_work"
  | "operator_note"
  | "audio_recording"
  | "image_scan"
  | "opcua_event"
  | "json_event"
  | "unknown";

export type SourceChannel =
  | "upload"
  | "paste"
  | "opcua"
  | "api"
  | "manual"
  | "simulator";

export type RawArtifact = {
  artifact_id: string;
  received_at_utc: string;
  original_filename?: string;
  mime_type?: string;
  extension?: string;
  size_bytes: number;
  sha256: string;
  source_channel: SourceChannel;
  raw_uri: string;
  detected_type?: ArtifactType;
  detection_confidence?: number;
  metadata: Record<string, unknown>;
};

export type CliffordInput =
  | { kind: "file"; filename: string; bytes: Uint8Array; mime_type?: string }
  | { kind: "paste"; text: string }
  | { kind: "json"; payload: unknown }
  | { kind: "event"; payload: unknown };

export type PreparedInput = {
  bytes: Uint8Array;
  source_channel: SourceChannel;
  original_filename?: string;
  mime_type?: string;
  extension?: string;
  payload?: unknown;
};

export type ArtifactDetection = {
  type: ArtifactType;
  confidence: number;
  mime_type?: string;
  is_binary: boolean;
  supported: boolean;
  reason?: string;
};
