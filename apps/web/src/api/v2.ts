/**
 * Typed clients for the v2 API surface: change pipeline, pattern library, operator views.
 * Types mirror apps/api responses; the server re-validates everything.
 */
import { apiFetch } from "./client";

// ---- Change pipeline ---------------------------------------------------------------------

export type ChangeStatus = "pending" | "rejected" | "deployed" | "stale" | "failed";
export type ChangeSource = "agent" | "pattern_library" | "studio" | "engineer";

export interface ChangeOp {
  op:
    | "add_edge"
    | "update_edge"
    | "remove_edge"
    | "upsert_node"
    | "add_root_cause_rule"
    | "add_situation_type"
    | "add_alarm_rule"
    | "update_alarm_rule";
  rationale?: string | null;
  [key: string]: unknown;
}

export interface ChangeSet {
  title: string;
  summary?: string;
  source: ChangeSource;
  source_ref?: string | null;
  ops: ChangeOp[];
}

export interface EntityDiff {
  doc: "causal_graph" | "alarm_rules";
  collection: string;
  id: string;
  kind: "added" | "removed" | "changed";
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  fields?: Record<string, { before: unknown; after: unknown }>;
}

export interface BundleValidation {
  ok: boolean;
  schema_errors: { doc: string; path: string; message: string }[];
  compile_errors: { field: string; message: string; fix: string }[];
  feedback_loops: { members: string[]; edge_ids: string[]; loop_ids: string[] }[];
  graph_hash: string;
}

export interface ChangeRequest {
  change_id: string;
  plant_id: string;
  title: string;
  summary: string;
  source: ChangeSource;
  source_ref: string | null;
  status: ChangeStatus;
  created_by: string;
  created_by_role: string;
  created_at: string | null;
  base_rev: number;
  change_set: ChangeSet;
  preview: { applies: boolean; error: string | null; diff: EntityDiff[]; validation: BundleValidation | null };
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  approve_edges: boolean;
  result_rev: number | null;
}

export interface RuntimeInfo {
  plant_id: string;
  bundle_rev: number | null;
  bundle_hash: string | null;
  graph_id: string | null;
  source: "revision" | "files";
}

export interface RevisionSummary {
  rev: number;
  parent_rev: number | null;
  bundle_hash: string;
  created_by: string;
  source_change_id: string | null;
  note: string | null;
  deployed_at: string | null;
}

export const listChanges = (status?: ChangeStatus, signal?: AbortSignal) =>
  apiFetch<{ changes: ChangeRequest[] }>(`/api/changes${status ? `?status=${status}` : ""}`, { signal });
export const getChange = (id: string, signal?: AbortSignal) =>
  apiFetch<{ change: ChangeRequest }>(`/api/changes/${encodeURIComponent(id)}`, { signal });
export const submitChange = (changeSet: ChangeSet) =>
  apiFetch<{ change: ChangeRequest }>("/api/changes", { method: "POST", body: changeSet });
export const reviewChange = (
  id: string,
  body: { decision: "approve" | "reject"; comment: string; approve_edges?: boolean | undefined },
) =>
  apiFetch<{ change: ChangeRequest; runtime: RuntimeInfo }>(`/api/changes/${encodeURIComponent(id)}/review`, {
    method: "POST",
    body,
  });
export const getActiveRevision = (signal?: AbortSignal) =>
  apiFetch<{ runtime: RuntimeInfo; latest_revision: Omit<RevisionSummary, "parent_rev" | "deployed_at"> | null }>(
    "/api/changes/active",
    { signal },
  );
export const listRevisions = (signal?: AbortSignal) =>
  apiFetch<{ revisions: RevisionSummary[] }>("/api/changes/revisions", { signal });
export const rollbackTo = (toRev: number, comment: string) =>
  apiFetch<{ rev: number; runtime: RuntimeInfo }>("/api/changes/rollback", {
    method: "POST",
    body: { to_rev: toRev, comment },
  });

// ---- Causal pattern library ----------------------------------------------------------------

export interface PatternSummary {
  pattern_id: string;
  title: string;
  category: string;
  severity: "info" | "warning" | "critical";
  required_roles: string[];
}

export interface PatternLibrarySummary {
  component_type: string;
  display_name: string;
  description: string;
  asset_type_aliases: string[];
  pattern_count: number;
  patterns: PatternSummary[];
}

export interface PatternSymptom {
  role: string;
  direction: string;
  onset_lag_ms: [number, number];
  weight: number;
  threshold_hint?: { relative_to_nominal?: number; absolute?: number; for_ms?: number };
  note?: string;
}

export interface PatternDetail extends PatternSummary {
  version: string;
  failure_mode: string;
  description?: string;
  typical_progression?: string;
  optional_roles?: string[];
  trigger_role: string;
  symptoms: PatternSymptom[];
  mechanism?: {
    nodes?: { id: string; label: string; kind?: string; role?: string }[];
    edges?: { from: string; to: string; sign: "+" | "-"; lag_ms?: [number, number]; loop_id?: string }[];
    loops?: { loop_id: string; polarity: "reinforcing" | "balancing"; description: string }[];
  };
  propagation?: {
    relation: string;
    effect_role: string;
    direction: string;
    polarity: string;
    lag_ms: [number, number];
    edge_type: string;
    loop_ok?: boolean;
    loop_id?: string;
    note?: string;
  }[];
  discriminators?: { vs_pattern: string; rule: string; first_role?: string; then_role?: string }[];
  signatures?: { domain: string; description: string; formula?: string }[];
  checks: { order: number; text: string; requires_isolation?: boolean }[];
  references?: string[];
}

export interface RoleDefinition {
  role: string;
  quantity: string;
  units: string[];
  description?: string;
}

export interface CoverageRow {
  pattern_id: string;
  title: string;
  category: string;
  severity: string;
  observable: boolean;
  missing_required: string[];
  missing_optional: string[];
  unresolved: string[];
}

export interface InstantiationResult {
  pattern_id: string;
  pattern_version: string;
  asset_id: string;
  ok: boolean;
  bindings: Record<string, { tag_id: string | null; method: string; candidates: string[] }>;
  missing_required: string[];
  missing_optional: string[];
  neighbours: Record<string, string[]>;
  change_set: ChangeSet | null;
  unresolved: string[];
  notes: string[];
}

export const listPatternLibraries = (signal?: AbortSignal) =>
  apiFetch<{ libraries: PatternLibrarySummary[]; pattern_count: number }>("/api/library/patterns", { signal });
export const getPattern = (id: string, signal?: AbortSignal) =>
  apiFetch<{ pattern: PatternDetail; component_type: string; roles: RoleDefinition[] }>(
    `/api/library/patterns/${encodeURIComponent(id)}`,
    { signal },
  );
export const getCoverage = (assetId: string, signal?: AbortSignal) =>
  apiFetch<{
    asset_id: string;
    asset_type: string;
    bundle_rev: number;
    observable: number;
    total: number;
    patterns: CoverageRow[];
  }>(`/api/library/patterns/coverage/${encodeURIComponent(assetId)}`, { signal });
export const instantiatePattern = (
  patternId: string,
  body: { asset_id: string; bindings?: Record<string, string> | undefined; submit?: boolean | undefined },
) =>
  apiFetch<{ result: InstantiationResult; bundle_rev: number; change: ChangeRequest | null }>(
    `/api/library/patterns/${encodeURIComponent(patternId)}/instantiate`,
    { method: "POST", body },
  );

// ---- Operator views ----------------------------------------------------------------------

export type TrendPoint = [ts: string, value: number | null, quality: string];

export interface TrendSeries {
  tag_id: string;
  unit: string | null;
  asset_id: string | null;
  points: TrendPoint[];
}

export interface AlarmRule {
  id: string;
  tag: string;
  asset_id?: string;
  severity: "info" | "warning" | "critical";
  priority?: number;
  message: string;
  condition: { op: string; threshold?: number; warning?: number; critical?: number; for_ms?: number };
  deadband?: number;
  delay_ms?: number;
  latching?: boolean;
  requires_ack?: boolean;
}

export interface ShelvedAlarm {
  alarm_id: string;
  reason?: string;
  by?: string;
  at?: string;
  until?: string;
}

export interface CausalGraphView {
  graph_id: string | null;
  bundle_rev: number | null;
  nodes: { id: string; label: string; asset_type: string | null; evidence_tags: string[]; status: string }[];
  edges: {
    id: string;
    from: string;
    to: string;
    approved: boolean;
    edge_type: string | null;
    lag_ms: [number, number] | null;
    polarity: "+" | "-" | "any";
    loop_ok: boolean;
    loop_id: string | null;
    provenance: string | null;
  }[];
  feedback_loops: string[][];
  highlight: { root_asset_id: string | null; traversed_edges: string[]; alarmed_assets: string[] };
}

export const getTrends = (tagIds: string[], seconds: number, signal?: AbortSignal) =>
  apiFetch<{ now: string; series: TrendSeries[] }>(
    `/api/runtime/trends?tag_ids=${encodeURIComponent(tagIds.join(","))}&seconds=${seconds}`,
    { signal },
  );
export const getAlarmRules = (signal?: AbortSignal) =>
  apiFetch<{ rules: AlarmRule[] }>("/api/runtime/alarm-rules", { signal });
export const getShelvedAlarms = (signal?: AbortSignal) =>
  apiFetch<{ shelved: ShelvedAlarm[] }>("/api/runtime/alarms/shelved", { signal });
export const shelveAlarm = (alarmId: string, durationS: number, reason: string) =>
  apiFetch<{ status: string; until: string; audit_id: string }>(
    `/api/runtime/alarms/${encodeURIComponent(alarmId)}/shelve`,
    { method: "POST", body: { duration_s: durationS, reason } },
  );
export const unshelveAlarm = (alarmId: string) =>
  apiFetch<{ status: string; audit_id: string }>(`/api/runtime/alarms/${encodeURIComponent(alarmId)}/unshelve`, {
    method: "POST",
  });
export const getCausalGraph = (signal?: AbortSignal) =>
  apiFetch<CausalGraphView>("/api/runtime/causal-graph", { signal });

/** One advisory action for the caller's role (GET /api/runtime/actions). PlantLens never executes it. */
export interface RuntimeAction {
  action_id: string;
  label: string;
  allowed: boolean;
  reason: string | null;
  allowed_roles: string[];
  blocking_alarms: string[];
  risk_level: string | null;
  requires_isolation: boolean;
  requires_operator_confirm: boolean;
  plc_permission_required?: boolean;
  safety_note: string | null;
  target_asset_id: string | null;
}

export interface RuntimeActions {
  situation_id?: string | null;
  situation_type: string | null;
  role: string;
  actions: RuntimeAction[];
}

export const getRuntimeActions = (situationId: string | null, signal?: AbortSignal) =>
  apiFetch<RuntimeActions>(
    situationId ? `/api/runtime/actions?situation_id=${encodeURIComponent(situationId)}` : "/api/runtime/actions",
    { signal },
  );

// ---- Studio layout -----------------------------------------------------------------------

export interface StudioLayout {
  plant_id: string;
  revision: number;
  positions: Record<string, { x: number; y: number }>;
  viewport: { x: number; y: number; zoom: number } | null;
}

export const getStudioLayout = (plantId: string, signal?: AbortSignal) =>
  apiFetch<StudioLayout>(`/api/studio/layout/${encodeURIComponent(plantId)}`, { signal });
export const putStudioLayout = (
  plantId: string,
  body: {
    positions: StudioLayout["positions"];
    viewport?: StudioLayout["viewport"] | undefined;
    base_revision?: number | undefined;
  },
) => apiFetch<StudioLayout>(`/api/studio/layout/${encodeURIComponent(plantId)}`, { method: "PUT", body });

// ---- Audit ledger ------------------------------------------------------------------------

export interface AuditRecord {
  audit_id: string;
  ts: string;
  actor_type: string;
  actor_id?: string;
  actor_role?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;
  hash_prev: string;
  hash_self: string;
}

export const getAudit = (
  params: { action?: string | undefined; entityId?: string | undefined; limit?: number; offset?: number },
  signal?: AbortSignal,
) => {
  const q = new URLSearchParams();
  if (params.action) q.set("action", params.action);
  if (params.entityId) q.set("entity_id", params.entityId);
  q.set("limit", String(params.limit ?? 200));
  q.set("offset", String(params.offset ?? 0));
  return apiFetch<{
    total: number;
    records: AuditRecord[];
    chain: { valid: boolean; checked_records: number; broken_index: number | null; reason: string | null };
  }>(`/api/audit?${q.toString()}`, { signal });
};
