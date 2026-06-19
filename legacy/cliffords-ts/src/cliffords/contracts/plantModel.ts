import type {
  CanonicalRecord,
  SourceRef
} from "./canonical.js";
import type { CliffordInput, RawArtifact } from "./artifact.js";
import type {
  MappingRequest,
  QuarantineRecord
} from "./quarantine.js";
import type {
  AuditEventInput,
  AuditEvent,
  CliffordRunResult,
  IngestionReport
} from "./validation.js";

export type TagDefinition = {
  id: string;
  label?: string;
  equipment_id?: string;
  zone_id?: string;
  signal_type?: string;
  facet?: string;
  archetype_id?: string;
  archetype?: string;
  engineering_unit?: string;
  normal?: [number, number];
  alarm_low?: number;
  alarm_high?: number;
  alarm_tag?: string;
  alarm_tags?: string[];
  physical_bounds?: [number, number];
  aliases?: string[];
};

export type EquipmentDefinition = {
  id: string;
  label?: string;
  zone_id?: string;
  archetype_id?: string;
  tag_prefix?: string;
  position?: [number, number, number];
  aliases?: string[];
};

export type ZoneDefinition = {
  id: string;
  label?: string;
  position?: [number, number, number];
  bounds?: [number, number, number];
  aliases?: string[];
};

export type ModelPort = {
  port_id: string;
  domain: "process" | "electrical" | "mechanical" | "thermal" | "control";
  direction: "in" | "out" | "bidirectional";
};

export type ModelSignal = {
  signal: string;
  facet: string;
  engineering_unit: string;
  normal?: [number, number];
  alarm_low?: number;
  alarm_high?: number;
  physical_bounds?: [number, number];
};

export type GeometryDefinition = {
  shape: string;
  [key: string]: unknown;
};

export type CalmCardDefinition = {
  headline_template?: string;
  evidence_signals?: string[];
};

export type ArchetypeDefinition = {
  id: string;
  label?: string;
  facets?: string[];
  ports?: ModelPort[];
  signals?: ModelSignal[];
  geometry?: GeometryDefinition;
  calm_card?: CalmCardDefinition;
  role_visibility?: Record<string, string[]>;
  signal_types?: string[];
};

export type TagRegistry = Record<string, TagDefinition>;
export type EquipmentRegistry = Record<string, EquipmentDefinition>;
export type ZoneRegistry = Record<string, ZoneDefinition>;
export type ArchetypeLibrary = Record<string, ArchetypeDefinition>;

export type SignalRule = {
  allowed_units?: string[];
  min_value?: number;
  max_value?: number;
};

export type OpcUaSeverityRange = {
  min: number;
  max: number;
  priority: 1 | 2 | 3 | 4;
};

export type CliffordConfig = {
  max_artifact_size_bytes: number;
  max_parsed_records: number;
  max_text_field_chars: number;
  max_json_depth: number;
  max_future_skew_sec: number;
  reject_uncertain_quality: boolean;
  extraction_confidence_threshold: number;
  mapping_confidence_threshold: number;
  duplicate_debounce_window_sec: number;
  opcua_severity_ranges: OpcUaSeverityRange[];
  signal_rules?: Record<string, SignalRule>;
  data_directory?: string;
};

export type Clock = {
  now(): Date;
};

export type IdProvider = {
  next(prefix: string): string;
};

export type RawStoreResult = {
  uri: string;
  duplicate: boolean;
};

export interface RawArtifactStore {
  put(sha256: string, bytes: Uint8Array): Promise<RawStoreResult>;
  get(sha256: string): Promise<Uint8Array | null>;
}

export interface CanonicalStore {
  put(runId: string, records: CanonicalRecord[]): Promise<void>;
  getAll(): Promise<CanonicalRecord[]>;
}

export interface QuarantineStore {
  put(runId: string, records: QuarantineRecord[]): Promise<void>;
  getAll(): Promise<QuarantineRecord[]>;
}

export interface AuditStore {
  append(event: AuditEventInput): Promise<void>;
  getAll(): Promise<AuditEvent[]>;
}

export interface RunArtifactStore {
  writeRunOutput(
    runId: string,
    name:
      | "artifact"
      | "parsed"
      | "canonical"
      | "quarantine"
      | "mapping-requests"
      | "report",
    value: unknown
  ): Promise<void>;
}

export type CliffordStores = {
  raw: RawArtifactStore;
  canonical: CanonicalStore;
  quarantine: QuarantineStore;
  audit: AuditStore;
  runs: RunArtifactStore;
};

export type CliffordContext = {
  plant_timezone?: string;
  tag_registry: TagRegistry;
  equipment_registry: EquipmentRegistry;
  zone_registry: ZoneRegistry;
  archetype_library: ArchetypeLibrary;
  config: CliffordConfig;
  stores?: Partial<CliffordStores>;
  clock?: Clock;
  ids?: IdProvider;
};

export type ResolutionStatus =
  | "RESOLVED"
  | "INFERRED_HIGH_CONFIDENCE"
  | "INFERRED_LOW_CONFIDENCE"
  | "NEEDS_MAPPING"
  | "UNKNOWN";

export type RegistryResolution = {
  status: ResolutionStatus;
  id: string | null;
  confidence: number;
  source_ref?: SourceRef;
};

export type CliffordRunner = (
  input: CliffordInput,
  context: CliffordContext
) => Promise<CliffordRunResult>;

export type RunPersistencePayload = {
  artifact: RawArtifact;
  canonical: CanonicalRecord[];
  quarantine: QuarantineRecord[];
  mapping_requests: MappingRequest[];
  report: IngestionReport;
};
