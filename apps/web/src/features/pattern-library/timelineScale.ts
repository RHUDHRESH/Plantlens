/**
 * Log-ish time axis for symptom onset windows: milliseconds, seconds, minutes, hours (and days
 * for slow degradation modes) share one readable axis. pos(t) = ln(1 + t/t0) / ln(1 + max/t0),
 * which is linear near the trigger onset (t ≪ t0) and logarithmic beyond it.
 */
import type { PatternSymptom } from "../../api/v2";

export const T0_MS = 100;
export const MIN_TICK_GAP = 0.1;

const NICE_MAX = [
  1_000, 10_000, 60_000, 600_000, 3_600_000, 6 * 3_600_000, 86_400_000, 7 * 86_400_000, 30 * 86_400_000,
  365 * 86_400_000, 5 * 365 * 86_400_000,
];

const TICKS: { ms: number; label: string }[] = [
  { ms: 0, label: "0" },
  { ms: 100, label: "100 ms" },
  { ms: 1_000, label: "1 s" },
  { ms: 10_000, label: "10 s" },
  { ms: 60_000, label: "1 min" },
  { ms: 600_000, label: "10 min" },
  { ms: 3_600_000, label: "1 h" },
  { ms: 6 * 3_600_000, label: "6 h" },
  { ms: 86_400_000, label: "1 d" },
  { ms: 7 * 86_400_000, label: "1 wk" },
  { ms: 30 * 86_400_000, label: "30 d" },
  { ms: 365 * 86_400_000, label: "1 y" },
  { ms: 5 * 365 * 86_400_000, label: "5 y" },
];

export interface TimeScale {
  max: number;
  pos: (ms: number) => number;
  ticks: { ms: number; label: string; pos: number }[];
}

/** Smallest "nice" axis end ≥ the largest lag (at least 10 s so instant symptoms still read). */
export function niceMax(maxLagMs: number): number {
  const target = Math.max(10_000, maxLagMs);
  return NICE_MAX.find((m) => m >= target) ?? target;
}

export function makeTimeScale(maxLagMs: number, t0 = T0_MS): TimeScale {
  const max = niceMax(maxLagMs);
  const denom = Math.log1p(max / t0);
  const pos = (ms: number) => {
    const clamped = Math.min(Math.max(ms, 0), max);
    return Math.log1p(clamped / t0) / denom;
  };
  // Always label 0 and the axis end; keep intermediate ticks ≥ MIN_TICK_GAP apart so labels never collide.
  const ticks: TimeScale["ticks"] = [{ ms: 0, label: "0", pos: 0 }];
  const endLabel = TICKS.find((t) => t.ms === max)?.label ?? `${Math.round(max / 1000)} s`;
  for (const t of TICKS) {
    if (t.ms <= 0 || t.ms >= max) continue;
    const p = pos(t.ms);
    if (p - ticks[ticks.length - 1]!.pos >= MIN_TICK_GAP && 1 - p >= MIN_TICK_GAP) ticks.push({ ...t, pos: p });
  }
  ticks.push({ ms: max, label: endLabel, pos: 1 });
  return { max, pos, ticks };
}

export function scaleForSymptoms(symptoms: readonly PatternSymptom[]): TimeScale {
  const maxLag = Math.max(0, ...symptoms.map((s) => s.onset_lag_ms[1] ?? 0));
  return makeTimeScale(maxLag);
}

/** Bar geometry in [0,1] units. Zero-width windows (instant) get a minimum visible width. */
export function barExtent(scale: TimeScale, lag: readonly [number, number] | readonly number[], minWidth = 0.012): { start: number; width: number; instant: boolean } {
  const a = scale.pos(lag[0] ?? 0);
  const b = scale.pos(lag[1] ?? lag[0] ?? 0);
  const instant = b - a < minWidth;
  return { start: a, width: instant ? minWidth : b - a, instant };
}

export const DIRECTION: Record<string, { glyph: string; label: string }> = {
  rise: { glyph: "↑", label: "rises" },
  fall: { glyph: "↓", label: "falls" },
  trip: { glyph: "⏻", label: "trips" },
  oscillate: { glyph: "∿", label: "oscillates" },
  stuck: { glyph: "▬", label: "sticks" },
  step: { glyph: "⎍", label: "steps" },
  missing: { glyph: "∅", label: "goes missing" },
};

export function directionOf(d: string): { glyph: string; label: string } {
  return DIRECTION[d] ?? { glyph: "•", label: d };
}

/** "> 1.15× nominal for 2 s", "> 130 abs.", or "" when no hint. */
export function thresholdText(symptom: Pick<PatternSymptom, "direction" | "threshold_hint">): string {
  const h = symptom.threshold_hint;
  if (!h) return "";
  const op = symptom.direction === "fall" ? "<" : symptom.direction === "rise" ? ">" : "≈";
  const parts: string[] = [];
  if (h.relative_to_nominal !== undefined) parts.push(`${op} ${h.relative_to_nominal}× nominal`);
  if (h.absolute !== undefined) parts.push(`${op} ${h.absolute}`);
  let text = parts.join(" or ");
  if (h.for_ms) text += `${text ? " " : ""}for ${h.for_ms >= 1000 ? `${h.for_ms / 1000} s` : `${h.for_ms} ms`}`;
  return text;
}

/** Bar opacity from symptom weight (0–1): faint symptoms still readable. */
export function weightOpacity(weight: number): number {
  const w = Math.min(1, Math.max(0, weight));
  return Math.round((0.3 + 0.7 * w) * 100) / 100;
}
