import type { DataQuality } from "./types";

export function formatDisplayValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return String(value);
}

export function formatDecodedValue(
  decoded: number | null | undefined,
  quality: DataQuality,
): string {
  if (quality === "BAD" || quality === "MISSING") return "—";
  if (decoded === null || decoded === undefined) return "—";
  return String(decoded);
}

export function formatTimestamp(ts: number | string | null | undefined): string {
  if (ts === null || ts === undefined) return "—";
  if (typeof ts === "number") {
    try {
      return new Date(ts).toISOString();
    } catch {
      return String(ts);
    }
  }
  return ts;
}

export function qualityLabel(quality: DataQuality): string {
  return quality;
}