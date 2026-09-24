/**
 * Pure helpers that turn change-pipeline payloads (entity diffs, change-set ops, alarm rules,
 * causal edges) into reviewable, human-readable text. Shared by Approvals, Revisions and the
 * pattern-library "Apply to asset" preview so every surface describes a change the same way.
 */
import type { ChangeOp, ChangeRequest, ChangeSet, EntityDiff } from "../../api/v2";
import { formatDateTime } from "../../lib/time";

// ---- Durations & values --------------------------------------------------------------------

function trimNumber(value: number, digits = 1): string {
  const fixed = value.toFixed(digits);
  return fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

/** 0 → "0 ms", 1500 → "1.5 s", 90000 → "1.5 min", 7200000 → "2 h", 2 days → "2 d". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  const abs = Math.abs(ms);
  if (abs < 1000) return `${trimNumber(ms, 0)} ms`;
  if (abs < 60_000) return `${trimNumber(ms / 1000)} s`;
  if (abs < 3_600_000) return `${trimNumber(ms / 60_000)} min`;
  if (abs < 86_400_000) return `${trimNumber(ms / 3_600_000)} h`;
  if (abs < 365 * 86_400_000) return `${trimNumber(ms / 86_400_000)} d`;
  return `${trimNumber(ms / (365 * 86_400_000))} y`;
}

/** [0, 500] → "0–500 ms"; units picked from the upper bound so both ends read alike. */
export function formatLagWindow(lag: readonly number[] | null | undefined): string {
  if (!lag || lag.length < 2) return "—";
  const [a, b] = lag as [number, number];
  if (a === b) return formatDuration(a);
  const hi = formatDuration(b);
  const unit = hi.split(" ")[1] ?? "ms";
  const factor: Record<string, number> = { ms: 1, s: 1000, min: 60_000, h: 3_600_000, d: 86_400_000, y: 365 * 86_400_000 };
  const lo = trimNumber(a / (factor[unit] ?? 1));
  return `${lo}–${hi}`;
}

export function formatValue(value: unknown, max = 160): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const text = JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** API timestamps are ISO; some are naive (no zone) and are UTC by contract. */
export function parseApiTime(ts: string | null | undefined): Date | null {
  if (!ts) return null;
  const hasZone = /[zZ]|[+-]\d\d:?\d\d$/.test(ts);
  const d = new Date(hasZone ? ts : `${ts}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatTime(ts: string | null | undefined): string {
  const d = parseApiTime(ts);
  // App-wide time policy (lib/time.ts): local zone, 24 h; callers add timeTitle() for the zone.
  return d ? formatDateTime(d) : "—";
}

export function formatRelative(ts: string | null | undefined, now: Date = new Date()): string {
  const d = parseApiTime(ts);
  if (!d) return "—";
  const s = Math.round((now.getTime() - d.getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86_400)} d ago`;
}

// ---- Edges ---------------------------------------------------------------------------------

export interface EdgeLike {
  id?: string;
  from?: string;
  to?: string;
  lag_ms?: readonly number[] | null;
  polarity?: string | null;
  loop_ok?: boolean;
  loop_id?: string | null;
  edge_type?: string | null;
  approved?: boolean;
}

export function polarityLabel(p: string | null | undefined): string {
  if (p === "+") return "+ same direction";
  if (p === "-") return "− opposite direction";
  if (p === "any") return "± any";
  return p ?? "—";
}

/** "MTR-301 → INV-102 · lag [0–500 ms] · polarity + · loop drive_current_limit". */
export function formatEdge(edge: EdgeLike): string {
  const parts = [`${edge.from ?? "?"} → ${edge.to ?? "?"}`];
  if (edge.lag_ms) parts.push(`lag [${formatLagWindow(edge.lag_ms)}]`);
  if (edge.polarity) parts.push(`polarity ${edge.polarity === "-" ? "−" : edge.polarity}`);
  if (edge.loop_ok || edge.loop_id) parts.push(`loop ${edge.loop_id || "flagged"}`);
  return parts.join(" · ");
}

// ---- Alarm rules ---------------------------------------------------------------------------

export interface AlarmRuleLike {
  id?: string;
  tag?: string;
  severity?: string;
  condition?: { op?: string; threshold?: number; warning?: number; critical?: number; for_ms?: number } | null;
  delay_ms?: number;
}

const OP_TEXT: Record<string, string> = { ">": ">", ">=": "≥", "<": "<", "<=": "≤", "==": "=", "!=": "≠" };

/** "MOTOR_301_CURRENT > 3.4 A for 2 s, warning" (units from the tag map when known). */
export function formatAlarmRule(rule: AlarmRuleLike, unitFor?: (tag: string) => string | null | undefined): string {
  const tag = rule.tag ?? "?";
  const unit = (rule.tag && unitFor?.(rule.tag)) || "";
  const u = unit && unit !== "bool" ? ` ${unit}` : "";
  const c = rule.condition ?? {};
  const op = c.op ?? "?";
  let expr: string;
  if (op === "bool_true") expr = `${tag} is true`;
  else if (op === "bool_false") expr = `${tag} is false`;
  else if (c.threshold !== undefined) expr = `${tag} ${OP_TEXT[op] ?? op} ${c.threshold}${u}`;
  else if (c.warning !== undefined || c.critical !== undefined) {
    const sym = OP_TEXT[op] ?? op;
    const bits = [];
    if (c.warning !== undefined) bits.push(`${sym} ${c.warning}${u} warning`);
    if (c.critical !== undefined) bits.push(`${sym} ${c.critical}${u} critical`);
    expr = `${tag} ${bits.join(" / ")}`;
  } else expr = `${tag} ${op}`;
  const hold = (c.for_ms ?? 0) + (rule.delay_ms ?? 0);
  if (hold > 0) expr += ` for ${formatDuration(hold)}`;
  const tiered = c.warning !== undefined || c.critical !== undefined;
  return tiered || !rule.severity ? expr : `${expr}, ${rule.severity}`;
}

// ---- Entity diff grouping ------------------------------------------------------------------

export type DiffKind = EntityDiff["kind"];

export interface DiffGroup {
  key: string;
  label: string;
  doc: string;
  collection: string;
  items: EntityDiff[];
  counts: Record<DiffKind, number>;
}

const COLLECTION_LABEL: Record<string, string> = {
  "causal_graph/edges": "Causal edges",
  "causal_graph/nodes": "Graph nodes (evidence)",
  "causal_graph/situation_types": "Situation types",
  "causal_graph/root_cause_rules": "Root-cause rules",
  "alarm_rules/rules": "Alarm rules",
};

const COLLECTION_ORDER = [
  "alarm_rules/rules",
  "causal_graph/nodes",
  "causal_graph/edges",
  "causal_graph/situation_types",
  "causal_graph/root_cause_rules",
];

const KIND_ORDER: Record<DiffKind, number> = { added: 0, changed: 1, removed: 2 };

export function collectionLabel(doc: string, collection: string): string {
  return COLLECTION_LABEL[`${doc}/${collection}`] ?? `${doc} · ${collection}`;
}

/** Group a flat diff by document/collection in review order; items sorted added → changed → removed. */
export function groupDiff(diff: readonly EntityDiff[]): DiffGroup[] {
  const groups = new Map<string, DiffGroup>();
  for (const entry of diff) {
    const key = `${entry.doc}/${entry.collection}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: collectionLabel(entry.doc, entry.collection),
        doc: entry.doc,
        collection: entry.collection,
        items: [],
        counts: { added: 0, changed: 0, removed: 0 },
      };
      groups.set(key, group);
    }
    group.items.push(entry);
    group.counts[entry.kind] += 1;
  }
  const rank = (k: string) => {
    const i = COLLECTION_ORDER.indexOf(k);
    return i === -1 ? COLLECTION_ORDER.length : i;
  };
  const out = [...groups.values()].sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key));
  for (const g of out) g.items.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id.localeCompare(b.id));
  return out;
}

export function diffTotals(diff: readonly EntityDiff[]): Record<DiffKind, number> {
  const totals: Record<DiffKind, number> = { added: 0, changed: 0, removed: 0 };
  for (const d of diff) totals[d.kind] += 1;
  return totals;
}

/** One-line headline for an entity diff row (edges and alarm rules are rendered semantically). */
export function describeEntity(
  entry: EntityDiff,
  unitFor?: (tag: string) => string | null | undefined,
  lookup?: (entry: EntityDiff) => Record<string, unknown> | undefined,
): string {
  let value = (entry.after ?? entry.before ?? {}) as Record<string, unknown>;
  if (entry.kind === "changed" && entry.fields) {
    // Field-level changes carry no full entity: overlay the new values on the current one.
    const base = lookup?.(entry) ?? {};
    const after = Object.fromEntries(Object.entries(entry.fields).map(([k, v]) => [k, v.after]));
    value = { ...base, ...after };
    const known = entry.collection === "edges" ? value.from && value.to : entry.collection === "rules" ? value.tag : true;
    if (!known) return `${entry.id} — ${Object.keys(entry.fields).join(", ")} changed`;
  }
  if (entry.collection === "edges") return formatEdge(value as EdgeLike);
  if (entry.collection === "rules" && entry.doc === "alarm_rules") return formatAlarmRule(value as AlarmRuleLike, unitFor);
  if (entry.collection === "situation_types") return String(value.title ?? entry.id);
  return entry.id;
}

// ---- Change-set ops (drafts not yet applied, e.g. the Apply-to-asset preview) --------------

export type OpGroupKey = "alarm_rules" | "node_evidence" | "edges" | "situation" | "other";

export interface OpGroup {
  key: OpGroupKey;
  label: string;
  ops: ChangeOp[];
}

const OP_GROUP: Record<ChangeOp["op"], OpGroupKey> = {
  add_alarm_rule: "alarm_rules",
  update_alarm_rule: "alarm_rules",
  upsert_node: "node_evidence",
  add_edge: "edges",
  update_edge: "edges",
  remove_edge: "edges",
  add_situation_type: "situation",
  add_root_cause_rule: "other",
};

const OP_GROUP_LABEL: Record<OpGroupKey, string> = {
  alarm_rules: "Alarm rules",
  node_evidence: "Node evidence",
  edges: "Causal edges & loop proposals",
  situation: "Situation type",
  other: "Other",
};

export function groupOps(changeSet: ChangeSet | null | undefined): OpGroup[] {
  if (!changeSet) return [];
  const order: OpGroupKey[] = ["alarm_rules", "node_evidence", "edges", "situation", "other"];
  const buckets = new Map<OpGroupKey, ChangeOp[]>();
  for (const op of changeSet.ops) {
    const key = OP_GROUP[op.op] ?? "other";
    buckets.set(key, [...(buckets.get(key) ?? []), op]);
  }
  return order.filter((k) => buckets.has(k)).map((k) => ({ key: k, label: OP_GROUP_LABEL[k], ops: buckets.get(k)! }));
}

export const OP_VERB: Record<ChangeOp["op"], { verb: string; kind: DiffKind }> = {
  add_edge: { verb: "Add edge", kind: "added" },
  update_edge: { verb: "Update edge", kind: "changed" },
  remove_edge: { verb: "Remove edge", kind: "removed" },
  upsert_node: { verb: "Merge node evidence", kind: "changed" },
  add_root_cause_rule: { verb: "Add root-cause rule", kind: "added" },
  add_situation_type: { verb: "Add situation type", kind: "added" },
  add_alarm_rule: { verb: "Add alarm rule", kind: "added" },
  update_alarm_rule: { verb: "Update alarm rule", kind: "changed" },
};

/** Human description of one draft op. */
export function describeOp(op: ChangeOp, unitFor?: (tag: string) => string | null | undefined): string {
  const o = op as Record<string, unknown>;
  switch (op.op) {
    case "add_edge":
      return formatEdge(o.edge as EdgeLike);
    case "update_edge": {
      const fields = (o.fields ?? {}) as Record<string, unknown>;
      const bits = Object.entries(fields).map(([k, v]) => `${k} = ${formatValue(v, 40)}`);
      return `${String(o.edge_id)}: ${bits.join(", ")}`;
    }
    case "remove_edge":
      return String(o.edge_id);
    case "upsert_node": {
      const node = (o.node ?? {}) as { id?: string; evidence_tags?: string[]; expected_symptoms?: string[]; fingerprint_rules?: unknown[] };
      const bits = [];
      if (node.evidence_tags?.length) bits.push(`evidence ${node.evidence_tags.join(", ")}`);
      if (node.expected_symptoms?.length) bits.push(`expects ${node.expected_symptoms.join(", ")}`);
      if (node.fingerprint_rules?.length) bits.push(`${node.fingerprint_rules.length} first-out rule${node.fingerprint_rules.length > 1 ? "s" : ""}`);
      return `${node.id ?? "?"}${bits.length ? ` — ${bits.join("; ")}` : ""}`;
    }
    case "add_alarm_rule": {
      const rule = (o.rule ?? {}) as AlarmRuleLike;
      return `${rule.id ?? "?"}: ${formatAlarmRule(rule, unitFor)}`;
    }
    case "update_alarm_rule": {
      const fields = (o.fields ?? {}) as Record<string, unknown>;
      return `${String(o.rule_id)}: ${Object.entries(fields).map(([k, v]) => `${k} = ${formatValue(v, 60)}`).join(", ")}`;
    }
    case "add_situation_type": {
      const st = (o.situation_type ?? {}) as { id?: string; title?: string; required_alarms?: string[] };
      return `${st.title ?? st.id ?? "?"}${st.required_alarms?.length ? ` — requires ${st.required_alarms.join(", ")}` : ""}`;
    }
    default:
      return formatValue(o.rule ?? o, 120);
  }
}

// ---- Change lifecycle ----------------------------------------------------------------------

export type QueueTab = "pending" | "stale" | "deployed" | "rejected";

export function tabForChange(change: Pick<ChangeRequest, "status">): QueueTab {
  if (change.status === "stale") return "stale";
  if (change.status === "deployed") return "deployed";
  if (change.status === "rejected" || change.status === "failed") return "rejected";
  return "pending";
}

/** A pending change drafted against an older revision will be refused as stale on review. */
export function isOutdated(change: Pick<ChangeRequest, "status" | "base_rev">, currentRev: number | null | undefined): boolean {
  return change.status === "pending" && currentRev != null && change.base_rev < currentRev;
}

export function validationStatus(change: Pick<ChangeRequest, "preview">): "valid" | "invalid" | "does_not_apply" | "unknown" {
  const p = change.preview;
  if (!p) return "unknown";
  if (!p.applies) return "does_not_apply";
  if (!p.validation) return "unknown";
  return p.validation.ok ? "valid" : "invalid";
}

// ---- Affected sub-graph (mini preview) -----------------------------------------------------

export interface MiniGraphNode {
  id: string;
  state: "added" | "changed" | "context";
}

export interface MiniGraphEdge {
  id: string;
  from: string;
  to: string;
  state: "added" | "changed" | "removed";
  polarity?: string | null;
  loop: boolean;
  label: string;
}

/**
 * Nodes/edges touched by a diff, for a small preview graph highlighting additions. Field-level
 * edge changes carry no endpoints, so `lookupEdge` (e.g. the live causal graph) resolves them.
 */
export function affectedGraph(
  diff: readonly EntityDiff[],
  lookupEdge?: (id: string) => EdgeLike | undefined,
): { nodes: MiniGraphNode[]; edges: MiniGraphEdge[] } {
  const nodes = new Map<string, MiniGraphNode>();
  const edges: MiniGraphEdge[] = [];
  const touch = (id: string, state: MiniGraphNode["state"]) => {
    const prev = nodes.get(id);
    if (!prev || (prev.state === "context" && state !== "context") || (prev.state === "changed" && state === "added")) {
      nodes.set(id, { id, state });
    }
  };
  for (const d of diff) {
    if (d.doc !== "causal_graph") continue;
    if (d.collection === "nodes") touch(d.id, d.kind === "added" ? "added" : "changed");
    if (d.collection === "edges") {
      const base = (d.after ?? d.before ?? lookupEdge?.(d.id) ?? {}) as EdgeLike;
      const changedFields: EdgeLike =
        d.kind === "changed" && d.fields
          ? (Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, v.after])) as EdgeLike)
          : {};
      const e: EdgeLike = { ...base, ...changedFields };
      if (!e.from || !e.to) continue; // endpoints unknown: listed in the diff table only
      const { from, to } = e;
      touch(from, "context");
      touch(to, "context");
      edges.push({
        id: d.id,
        from,
        to,
        state: d.kind,
        polarity: e.polarity ?? null,
        loop: Boolean(e.loop_ok || e.loop_id),
        label: `${formatLagWindow(e.lag_ms)}${e.polarity ? ` · ${e.polarity === "-" ? "−" : e.polarity}` : ""}`,
      });
    }
  }
  return { nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)), edges };
}
