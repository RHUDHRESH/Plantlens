/**
 * Pure trend transforms: API points → uPlot aligned arrays (quality gaps), alarm limits from
 * rules, unit grouping into panes, CSV export and URL state. No uPlot import here so the Alarms
 * and Overview chunks can reuse the limit logic without pulling the chart library.
 */
import type { AlarmRule, TrendSeries } from "../../api/v2";

export const TREND_RANGES = [
  { key: "5m", label: "5 min", seconds: 300 },
  { key: "15m", label: "15 min", seconds: 900 },
  { key: "1h", label: "1 h", seconds: 3600 },
  { key: "8h", label: "8 h", seconds: 8 * 3600 },
] as const;
export type TrendRangeKey = (typeof TREND_RANGES)[number]["key"];
export const DEFAULT_RANGE: TrendRangeKey = "15m";
export const MAX_TAGS = 8;

export function rangeSeconds(key: string): number {
  return TREND_RANGES.find((r) => r.key === key)?.seconds ?? 900;
}

// ---- Alarm limits ----------------------------------------------------------------------------

export type LimitTone = "critical" | "high" | "medium";

export interface TrendLimit {
  tagId: string;
  alarmId: string;
  value: number;
  tone: LimitTone;
  /** e.g. "DC_BUS_LOW · L 42" */
  label: string;
}

function toneForPriority(priority: number | undefined, severity: string): LimitTone {
  if (priority === 1 || severity === "critical") return "critical";
  if (priority === 2 || severity === "warning") return "high";
  return "medium";
}

/** Numeric limits for the given tags. Boolean conditions have no line to draw. */
export function extractLimits(rules: AlarmRule[] | undefined, tagIds: string[]): TrendLimit[] {
  if (!rules?.length) return [];
  const wanted = new Set(tagIds);
  const out: TrendLimit[] = [];
  for (const rule of rules) {
    if (!wanted.has(rule.tag)) continue;
    const { op, threshold, warning, critical } = rule.condition;
    if (op === "bool_true" || op === "bool_false") continue;
    const push = (value: number | null | undefined, tone: LimitTone, band: string) => {
      if (typeof value !== "number" || !Number.isFinite(value)) return;
      out.push({ tagId: rule.tag, alarmId: rule.id, value, tone, label: `${rule.id}${band} ${op} ${value}` });
    };
    push(threshold, toneForPriority(rule.priority, rule.severity), "");
    push(warning, "high", " (warn)");
    push(critical, "critical", " (crit)");
  }
  return out;
}

// ---- Points → uPlot --------------------------------------------------------------------------

export interface AlignedTrend {
  /** Epoch seconds, ascending, unique. */
  xs: number[];
  /** One array per series. number = GOOD sample, null = non-GOOD (gap), undefined = no sample at x. */
  ys: (number | null | undefined)[][];
  /** Non-GOOD samples, for quality marks under the plot. */
  qualityMarks: { series: number; x: number; quality: string }[];
}

function sampleValue(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  return null;
}

export function alignSeries(series: Pick<TrendSeries, "points">[]): AlignedTrend {
  const stamps = new Set<number>();
  const parsed = series.map((s) =>
    s.points
      .map(([ts, v, q]) => ({ x: Date.parse(ts) / 1000, v: sampleValue(v), q }))
      .filter((p) => Number.isFinite(p.x)),
  );
  for (const pts of parsed) for (const p of pts) stamps.add(p.x);
  const xs = [...stamps].sort((a, b) => a - b);
  const index = new Map(xs.map((x, i) => [x, i]));
  const qualityMarks: AlignedTrend["qualityMarks"] = [];
  const ys = parsed.map((pts, si) => {
    const col: (number | null | undefined)[] = new Array(xs.length).fill(undefined);
    for (const p of pts) {
      const i = index.get(p.x)!;
      if (p.q !== "GOOD" || p.v === null) {
        col[i] = null;
        qualityMarks.push({ series: si, x: p.x, quality: p.q });
      } else {
        col[i] = p.v;
      }
    }
    return col;
  });
  return { xs, ys, qualityMarks };
}

/**
 * Sample-and-hold carry-in: frames are sent on change, so a tag that has not changed for longer
 * than the window has no samples in it. When the live frame is GOOD and older than the window,
 * its value is carried in at the window start (it is the value throughout the window).
 */
export function withCarryIn<T extends Pick<TrendSeries, "points">>(
  series: T,
  live: { value: unknown; quality: string; timestamp: string } | undefined,
  fromS: number,
): T {
  if (series.points.length || !live || live.quality !== "GOOD") return series;
  const liveS = Date.parse(live.timestamp) / 1000;
  const v = sampleValue(live.value);
  if (!Number.isFinite(liveS) || liveS > fromS || v === null) return series;
  return { ...series, points: [[new Date(fromS * 1000).toISOString(), v, "GOOD"]] };
}

// ---- Panes -----------------------------------------------------------------------------------

export interface TrendPane {
  unit: string;
  tagIds: string[];
}

/** One pane (one y-axis) per unit, in first-selected order — never two scales on one plot. */
export function groupByUnit(tagIds: string[], unitOf: (tagId: string) => string | null | undefined): TrendPane[] {
  const panes: TrendPane[] = [];
  for (const id of tagIds) {
    const unit = unitOf(id) ?? "";
    const pane = panes.find((p) => p.unit === unit);
    if (pane) pane.tagIds.push(id);
    else panes.push({ unit, tagIds: [id] });
  }
  return panes;
}

// ---- CSV -------------------------------------------------------------------------------------

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Long format: one row per sample, so quality and gaps survive the export exactly. */
export function toCsv(series: TrendSeries[]): string {
  const rows = [["timestamp", "tag_id", "value", "unit", "quality", "asset_id"].join(",")];
  const all: { ts: string; line: string }[] = [];
  for (const s of series) {
    for (const [ts, v, q] of s.points) {
      all.push({
        ts,
        line: [ts, s.tag_id, v === null ? "" : String(v), s.unit ?? "", q, s.asset_id ?? ""].map(csvCell).join(","),
      });
    }
  }
  all.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  for (const r of all) rows.push(r.line);
  return `${rows.join("\n")}\n`;
}

// ---- Colour slots ----------------------------------------------------------------------------

/**
 * Colour follows the entity, never its rank: a tag keeps its slot while selected, and a new tag
 * takes the lowest free slot. Removing a tag never repaints the others.
 */
export function assignSlots(prev: Record<string, number>, tags: string[]): Record<string, number> {
  const next: Record<string, number> = {};
  const used = new Set<number>();
  for (const t of tags) {
    const s = prev[t];
    if (s !== undefined && !used.has(s)) {
      next[t] = s;
      used.add(s);
    }
  }
  for (const t of tags) {
    if (next[t] !== undefined) continue;
    let s = 0;
    while (used.has(s)) s += 1;
    next[t] = s;
    used.add(s);
  }
  return next;
}

// ---- Readout ---------------------------------------------------------------------------------

/**
 * Value shown for a series at time `x` (sample-and-hold): the latest sample at or before x.
 * `gap` is true when that sample was non-GOOD; null when there is no sample yet.
 */
export function valueAt(
  xs: number[],
  ys: (number | null | undefined)[],
  x: number,
): { value: number | null; at: number; gap: boolean } | null {
  let i = xs.length - 1;
  while (i >= 0 && xs[i]! > x) i -= 1;
  for (; i >= 0; i -= 1) {
    const v = ys[i];
    if (v === undefined) continue;
    return { value: v, at: xs[i]!, gap: v === null };
  }
  return null;
}

// ---- URL state -------------------------------------------------------------------------------

export function parseTrendParams(params: URLSearchParams): { tags: string[]; range: TrendRangeKey } {
  const tags = (params.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(0, MAX_TAGS);
  const r = params.get("range");
  const range = (TREND_RANGES.find((x) => x.key === r)?.key ?? DEFAULT_RANGE) as TrendRangeKey;
  return { tags, range };
}

export function trendsHref(tags: string[], range: TrendRangeKey = DEFAULT_RANGE): string {
  const q = new URLSearchParams();
  if (tags.length) q.set("tags", tags.slice(0, MAX_TAGS).join(","));
  q.set("range", range);
  return `/ops/trends?${q.toString().replace(/%2C/g, ",")}`;
}
