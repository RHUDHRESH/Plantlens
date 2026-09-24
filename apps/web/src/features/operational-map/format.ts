/**
 * Shared operator formatting: values always carry units, times are 24 h, statuses map onto the
 * primitives' StatusKind (colour + shape + text).
 */
import type { StatusKind } from "../../components/ui/primitives";
import type { AssetStatus } from "../maps2d/mapTypes";

const UNIT_LABEL: Record<string, string> = { C: "°C", F: "°F", degC: "°C", pct: "%", percent: "%" };

export function unitLabel(unit: string | null | undefined): string {
  if (!unit || unit === "bool") return "";
  return UNIT_LABEL[unit] ?? unit;
}

/** Significant-figure aware formatting that keeps tabular alignment calm (no 9-digit floats). */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toFixed(0);
  if (abs >= 100) return value.toFixed(1);
  if (abs >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

export function formatValue(value: unknown, unit?: string | null): string {
  if (value === null || value === undefined || value === "") return "—";
  if (unit === "bool" || typeof value === "boolean") {
    const on = value === true || value === 1 || value === "1" || value === "true";
    return on ? "ON" : "OFF";
  }
  if (typeof value === "number") {
    const u = unitLabel(unit);
    return u ? `${formatNumber(value)} ${u}` : formatNumber(value);
  }
  return String(value);
}

export function parseTs(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : null;
}

/** HH:MM:SS (24 h). Runtime timestamps are shown in the plant's runtime clock, never re-zoned. */
export function formatClock(ts: string | number | null | undefined, withMs = false): string {
  const ms = typeof ts === "number" ? ts : parseTs(ts ?? null);
  if (ms === null) return "—";
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  if (!withMs) return `${hh}:${mm}:${ss}`;
  const frac = String(Math.floor(d.getUTCMilliseconds() / 100));
  return `${hh}:${mm}:${ss}.${frac}`;
}

export function formatDateTime(ts: string | number | null | undefined): string {
  const ms = typeof ts === "number" ? ts : parseTs(ts ?? null);
  if (ms === null) return "—";
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} ${formatClock(ms)}`;
}

/** Compact age: 42 s · 3 min 05 s · 2 h 14 min · 3 d 4 h. */
export function formatAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0 s";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, "0")} s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ${String(m % 60).padStart(2, "0")} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

/** Signed offset from a reference, e.g. "+2.5 s". */
export function formatOffset(ms: number): string {
  if (!Number.isFinite(ms)) return "";
  if (Math.abs(ms) < 50) return "±0 s";
  const s = ms / 1000;
  const txt = Math.abs(s) >= 60 ? formatAge(Math.abs(ms)) : `${Math.abs(s) >= 10 ? Math.abs(s).toFixed(0) : Math.abs(s).toFixed(1)} s`;
  return `${s >= 0 ? "+" : "−"}${txt}`;
}

export function assetStatusKind(status: AssetStatus | string | null | undefined): StatusKind {
  switch (status) {
    case "critical":
      return "critical";
    case "warning":
      return "high";
    case "sensor_bad":
      return "sensor_bad";
    case "offline":
      return "offline";
    default:
      return "normal";
  }
}

export function assetStatusLabel(status: AssetStatus | string | null | undefined): string {
  switch (status) {
    case "critical":
      return "Critical";
    case "warning":
      return "Warning";
    case "sensor_bad":
      return "Sensor bad";
    case "offline":
      return "Offline";
    case "normal":
      return "Normal";
    default:
      return "No data";
  }
}

export function isAbnormal(status: AssetStatus | string | null | undefined): boolean {
  return status === "critical" || status === "warning" || status === "sensor_bad" || status === "offline";
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
