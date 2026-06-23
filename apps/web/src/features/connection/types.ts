export type DataQuality = "GOOD" | "UNCERTAIN" | "BAD" | "STALE" | "MISSING";

export interface ConnectionStatus {
  connected: boolean;
  port: string | null;
  slaveId: number | null;
  pollHz: number | null;
  lastPollTs: number | string | null;
  okCount: number;
  errorCount: number;
  lastError: string | null;
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