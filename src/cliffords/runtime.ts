import { randomUUID } from "node:crypto";
import type {
  Clock,
  CliffordConfig,
  IdProvider,
  OpcUaSeverityRange
} from "./contracts/plantModel.js";

export const systemClock: Clock = {
  now: () => new Date()
};

export const randomIdProvider: IdProvider = {
  next: (prefix) => `${prefix}_${randomUUID()}`
};

export const DEFAULT_OPCUA_SEVERITY_RANGES: OpcUaSeverityRange[] = [
  { min: 751, max: 1000, priority: 1 },
  { min: 501, max: 750, priority: 2 },
  { min: 251, max: 500, priority: 3 },
  { min: 1, max: 250, priority: 4 }
];

export const DEFAULT_CLIFFORD_CONFIG: CliffordConfig = {
  max_artifact_size_bytes: 25 * 1024 * 1024,
  max_parsed_records: 100_000,
  max_text_field_chars: 64 * 1024,
  max_json_depth: 64,
  max_future_skew_sec: 5 * 60,
  reject_uncertain_quality: true,
  extraction_confidence_threshold: 0.6,
  mapping_confidence_threshold: 0.9,
  duplicate_debounce_window_sec: 5,
  opcua_severity_ranges: DEFAULT_OPCUA_SEVERITY_RANGES
};

export function isoNow(clock: Clock): string {
  return clock.now().toISOString();
}
