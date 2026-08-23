export type DataQuality = "GOOD" | "UNCERTAIN" | "BAD" | "STALE" | "MISSING";

export interface ConnectionStatus {
  connected: boolean;
  port: string | null;
  mode?: string | null;
  readOnly?: boolean;
  baudrate?: number | null;
  framing?: string | null;
  slaveId: number | null;
  pollHz: number | null;
  lastPollTs: number | string | null;
  okCount: number;
  errorCount: number;
  lastError: string | null;
  bytesSeen?: number;
  validFrames?: number;
  nativeRegisterCount?: number;
  observedSlaveIds?: number[];
}

export interface ConnectionFormState {
  port: string;
  baudrate: number;
  parity: "N" | "E" | "O";
  stopbits: number;
  bytesize: number;
  slaveId: number;
  pollHz: number;
}

export interface ScanRequest {
  startReg: number;
  count: number;
  regType: "input" | "holding";
  dataType: "float32" | "int16" | "uint16" | "int32" | "uint32";
  wordOrder: "AB" | "BA";
}

export interface ScanRow {
  channelRef: string;
  register: number;
  regType: "input" | "holding";
  dataType: ScanRequest["dataType"];
  wordOrder: "AB" | "BA";
  raw: number | string | null;
  decoded: number | null;
  responding: boolean;
  suggestedTag: string | null;
  boundTag?: string | null;
  equipment?: string | null;
  quality: DataQuality;
}

export interface Binding {
  channelRef: string;
  tagId: string;
  equipment: string;
  dataType: ScanRequest["dataType"];
  wordOrder: "AB" | "BA";
  scale: number;
  offset: number;
  unit: string;
}

export interface TestReadResult {
  ok: boolean;
  value: number | null;
  latencyMs: number | null;
  error?: string;
}

export interface ModelBundleLite {
  tags?: Array<Record<string, unknown>>;
  plant?: Record<string, unknown>;
  plant_layout?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface EndpointError {
  endpoint: string;
  message: string;
  status?: number;
}

export interface EdgeCommissioningReceipt {
  status: "SHADOW_RESULT" | "ABSTAIN";
  reason?: string;
  observed_at?: string;
  edge_node?: string;
  measurements?: {
    voltage_candidate: number;
    current_candidate: number;
    power_candidate: number;
    auxiliary_candidate: number;
    power_balance_error_pct: number;
  };
  thresholds?: {
    state:
      | "WITHIN_LOW_LOAD_BASELINE"
      | "ABOVE_LOW_LOAD_BASELINE"
      | "LOW_LOAD_ENVELOPE_EXCEEDED";
    provisional: boolean;
    current_ratio: number;
    power_ratio: number;
    voltage_ratio: number;
  };
  ensemble?: {
    decision: string;
    top_shadow_candidate: string;
    probability: number;
    disagreement: number;
    effective_quality: number;
    abstention_reasons: string[];
    contributors: Array<{ feature: string; contribution: number }>;
    candidates: Array<{ fault_id: string; probability: number; disagreement: number }>;
    missing_features: string[];
  };
  fault_summary?: {
    status: "SHADOW_CANDIDATE" | "KNOWN_SIGNATURE" | "UNRECOGNIZED_SIGNATURE";
    title: string;
    interpretation: string;
    recommended_checks: string[];
  };
  motor_fingerprint?: {
    model_type: string;
    model_sha256: string;
    trained_samples: number;
    decision: string;
    matched_prototype: string;
    similarity: number;
    novelty_score: number;
    confidence: number;
    contributors: Array<{ feature: string; deviation: number }>;
    limitations: string[];
  };
  explanation?: string;
  read_only: boolean;
  runtime_diagnosis: boolean;
}
