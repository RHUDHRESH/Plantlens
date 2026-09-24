/**
 * ISA-18.2 alarm list model: pure functions that turn the runtime's active alarms into rows with
 * priority, state, first-out and situation membership, plus sort/filter and shelve validation.
 * No diagnosis happens here — situations come from the backend.
 */
import type { ActiveAlarm } from "../../api/types";
import type { AlarmRule } from "../../api/v2";
import type { Situation } from "../../app/schemas/situation";
import type { TagFrame } from "../../app/schemas/tagFrame";
import { priorityToStatus } from "../../components/ui/primitives";
import type { StatusKind } from "../../components/ui/primitives";
import { parseTs } from "../operational-map/format";
import type { PlantModel } from "../operational-map/plantModel";

export interface AlarmEvidence {
  tag_id?: string;
  observed_value?: number | boolean | string | null;
  comparator?: string;
  threshold?: number | null;
  quality?: string;
}

/** The runtime sends a few more fields than the shared ActiveAlarm type declares. */
export interface RuntimeAlarm extends ActiveAlarm {
  quality?: string;
  evidence?: AlarmEvidence;
}

export interface RuntimeAlarmRule extends AlarmRule {
  shelvable?: boolean;
  max_shelve_seconds?: number | null;
}

export type AlarmState = "unacked" | "acked" | "latched";

export const ALARM_STATE_LABEL: Record<AlarmState, string> = {
  unacked: "Unacked",
  acked: "Acked",
  latched: "Cleared · unacked",
};

export interface AlarmRow {
  id: string;
  alarm: RuntimeAlarm;
  rule: RuntimeAlarmRule | undefined;
  priority: 1 | 2 | 3 | 4;
  status: StatusKind;
  state: AlarmState;
  message: string;
  assetId: string;
  assetName: string;
  tagId: string;
  value: RuntimeAlarm["value"];
  unit: string | null;
  onsetMs: number;
  raisedMs: number;
  floodId: number;
  firstOut: boolean;
  situationId: string | null;
  situationTitle: string | null;
}

export function alarmPriority(alarm: Pick<ActiveAlarm, "priority" | "severity">, rule?: Pick<AlarmRule, "priority" | "severity">): 1 | 2 | 3 | 4 {
  const p = alarm.priority ?? rule?.priority;
  if (p === 1 || p === 2 || p === 3 || p === 4) return p;
  const sev = alarm.severity ?? rule?.severity;
  if (sev === "critical") return 1;
  if (sev === "warning") return 2;
  return 4;
}

export function priorityStatus(priority: 1 | 2 | 3 | 4): StatusKind {
  return priorityToStatus(priority);
}

export const PRIORITY_LABEL: Record<1 | 2 | 3 | 4, string> = { 1: "P1 Critical", 2: "P2 High", 3: "P3 Medium", 4: "P4 Low" };

/** Does the rule's alarm condition hold for this value? `null` when it cannot be decided. */
export function conditionHolds(rule: Pick<AlarmRule, "condition"> | undefined, value: unknown): boolean | null {
  if (!rule || value === null || value === undefined) return null;
  const { op } = rule.condition;
  if (op === "bool_true" || op === "bool_false") {
    const on = value === true || value === 1 || value === "true";
    return op === "bool_true" ? on : !on;
  }
  if (typeof value !== "number") return null;
  const limit = primaryLimit(rule);
  if (limit === null) return null;
  switch (op) {
    case ">":
      return value > limit;
    case ">=":
      return value >= limit;
    case "<":
      return value < limit;
    case "<=":
      return value <= limit;
    case "==":
      return value === limit;
    case "!=":
      return value !== limit;
    default:
      return null;
  }
}

/** The limit that raises the alarm: threshold, else the warning band, else critical. */
export function primaryLimit(rule: Pick<AlarmRule, "condition">): number | null {
  const c = rule.condition;
  return c.threshold ?? c.warning ?? c.critical ?? null;
}

/**
 * Acked alarms are removed by the runtime once they clear, so an active alarm whose condition no
 * longer holds is a latched/return-to-normal alarm that still needs acknowledgement.
 */
export function alarmState(alarm: Pick<ActiveAlarm, "acked" | "value">, rule: AlarmRule | undefined, liveValue?: unknown): AlarmState {
  const holds = conditionHolds(rule, liveValue === undefined ? alarm.value : liveValue);
  if (holds === false && !alarm.acked) return "latched";
  return alarm.acked ? "acked" : "unacked";
}

export function onsetOf(alarm: Pick<ActiveAlarm, "onset_at" | "raised_at">): number {
  return parseTs(alarm.onset_at ?? null) ?? parseTs(alarm.raised_at) ?? 0;
}

/**
 * Floods: alarms whose onsets chain within `gapMs` of each other. The earliest onset in each flood
 * is the first-out alarm (ties broken by raise time, then id, so the marker is stable).
 */
export function computeFirstOut(
  alarms: Pick<ActiveAlarm, "alarm_id" | "onset_at" | "raised_at">[],
  gapMs = 10 * 60_000,
): Map<string, { floodId: number; firstOut: boolean }> {
  const sorted = [...alarms].sort(
    (a, b) =>
      onsetOf(a) - onsetOf(b) ||
      (parseTs(a.raised_at) ?? 0) - (parseTs(b.raised_at) ?? 0) ||
      a.alarm_id.localeCompare(b.alarm_id),
  );
  const out = new Map<string, { floodId: number; firstOut: boolean }>();
  let flood = -1;
  let last = -Infinity;
  for (const a of sorted) {
    const t = onsetOf(a);
    const newFlood = flood < 0 || t - last > gapMs;
    if (newFlood) flood += 1;
    out.set(a.alarm_id, { floodId: flood, firstOut: newFlood });
    last = t;
  }
  // A single alarm is not a flood; the marker only means something when others followed.
  const sizes = new Map<number, number>();
  for (const v of out.values()) sizes.set(v.floodId, (sizes.get(v.floodId) ?? 0) + 1);
  for (const v of out.values()) if ((sizes.get(v.floodId) ?? 0) < 2) v.firstOut = false;
  return out;
}

export interface BuildRowsInput {
  alarms: RuntimeAlarm[];
  rules?: RuntimeAlarmRule[] | undefined;
  situations?: (Situation | null | undefined)[] | undefined;
  model?: PlantModel | undefined;
  tags?: Record<string, TagFrame> | undefined;
}

export function buildAlarmRows({ alarms, rules = [], situations = [], model, tags = {} }: BuildRowsInput): AlarmRow[] {
  const ruleById = new Map(rules.map((r) => [r.id, r]));
  const firstOut = computeFirstOut(alarms);
  const situationOf = new Map<string, Situation>();
  for (const s of situations) {
    if (!s) continue;
    for (const id of s.grouped_alarm_ids) if (!situationOf.has(id)) situationOf.set(id, s);
  }
  return alarms.map((alarm) => {
    const rule = ruleById.get(alarm.alarm_id);
    const priority = alarmPriority(alarm, rule);
    const live = tags[alarm.tag_id];
    const fo = firstOut.get(alarm.alarm_id);
    const sit = situationOf.get(alarm.alarm_id);
    return {
      id: alarm.alarm_id,
      alarm,
      rule,
      priority,
      status: priorityStatus(priority),
      state: alarmState(alarm, rule, live && live.quality === "GOOD" ? live.value : undefined),
      message: alarm.message,
      assetId: alarm.asset_id,
      assetName: model?.assetById[alarm.asset_id]?.name ?? alarm.asset_id,
      tagId: alarm.tag_id,
      value: live?.value ?? alarm.value ?? null,
      unit: live?.unit ?? model?.tagById[alarm.tag_id]?.unit ?? null,
      onsetMs: onsetOf(alarm),
      raisedMs: parseTs(alarm.raised_at) ?? onsetOf(alarm),
      floodId: fo?.floodId ?? 0,
      firstOut: fo?.firstOut ?? false,
      situationId: sit?.situation_id ?? null,
      situationTitle: sit?.title ?? null,
    };
  });
}

// ---- Sort & filter ---------------------------------------------------------------------------

export type SortKey = "priority" | "state" | "message" | "asset" | "onset" | "age";
export type SortDir = "asc" | "desc";

const STATE_ORDER: Record<AlarmState, number> = { unacked: 0, latched: 1, acked: 2 };

export function compareRows(a: AlarmRow, b: AlarmRow, key: SortKey): number {
  switch (key) {
    case "priority":
      return a.priority - b.priority || STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.onsetMs - b.onsetMs;
    case "state":
      return STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.priority - b.priority;
    case "message":
      return a.message.localeCompare(b.message);
    case "asset":
      return a.assetName.localeCompare(b.assetName) || a.priority - b.priority;
    case "onset":
      return a.onsetMs - b.onsetMs;
    case "age":
      // Oldest first when ascending by age = earliest onset first.
      return b.onsetMs - a.onsetMs;
  }
}

export function sortRows(rows: AlarmRow[], key: SortKey, dir: SortDir): AlarmRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => sign * compareRows(a, b, key) || a.id.localeCompare(b.id));
}

export interface AlarmFilter {
  priorities: (1 | 2 | 3 | 4)[];
  state: "all" | AlarmState;
  assetId: string;
  text: string;
}

export const EMPTY_FILTER: AlarmFilter = { priorities: [], state: "all", assetId: "", text: "" };

export function filterRows(rows: AlarmRow[], f: AlarmFilter): AlarmRow[] {
  const q = f.text.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.priorities.length && !f.priorities.includes(r.priority)) return false;
    if (f.state !== "all" && r.state !== f.state) return false;
    if (f.assetId && r.assetId !== f.assetId) return false;
    if (q) {
      const hay = `${r.id} ${r.message} ${r.assetId} ${r.assetName} ${r.tagId}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ---- Shelving --------------------------------------------------------------------------------

export const SHELVE_PRESETS = [
  { seconds: 15 * 60, label: "15 min" },
  { seconds: 60 * 60, label: "1 h" },
  { seconds: 4 * 3600, label: "4 h" },
  { seconds: 8 * 3600, label: "8 h" },
] as const;

export const SHELVE_REASON_MIN = 3;

/** Presets allowed by the rule (max_shelve_seconds) and the API (60 s – 8 h). */
export function allowedShelvePresets(rule: RuntimeAlarmRule | undefined): number[] {
  const max = rule?.max_shelve_seconds ?? 8 * 3600;
  return SHELVE_PRESETS.map((p) => p.seconds).filter((s) => s <= max);
}

export interface ShelveValidation {
  ok: boolean;
  errors: { field: "duration" | "reason" | "rule"; message: string }[];
}

export function validateShelve(input: { seconds: number | null; reason: string; rule: RuntimeAlarmRule | undefined }): ShelveValidation {
  const errors: ShelveValidation["errors"] = [];
  if (input.rule?.shelvable === false) {
    errors.push({ field: "rule", message: "This alarm is not shelvable by rule. Fix: ask an engineer to change the alarm rule." });
  }
  if (input.seconds === null) {
    errors.push({ field: "duration", message: "Choose how long to shelve the alarm." });
  } else if (!allowedShelvePresets(input.rule).includes(input.seconds)) {
    const max = input.rule?.max_shelve_seconds;
    errors.push({
      field: "duration",
      message: max ? `This rule allows shelving for at most ${Math.round(max / 60)} min.` : "Choose a duration between 15 min and 8 h.",
    });
  }
  if (input.reason.trim().length < SHELVE_REASON_MIN) {
    errors.push({ field: "reason", message: "Give a reason (at least 3 characters) so the next shift knows why." });
  }
  return { ok: errors.length === 0, errors };
}

/** Ack of a P1 alarm needs an explicit confirmation step. */
export function ackNeedsConfirm(rows: Pick<AlarmRow, "priority">[]): boolean {
  return rows.some((r) => r.priority === 1);
}
