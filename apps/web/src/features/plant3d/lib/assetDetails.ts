/** Side-panel data for a selected asset (pure selectors over the runtime store + compiled bundle). */
import type { ActiveAlarm } from "../../../api/types";
import type { TagFrame } from "../../../app/schemas/tagFrame";

export interface TagIndexEntry {
  asset_id?: string;
  unit?: string;
  signal_type?: string;
}

export interface TagRow {
  tagId: string;
  value: string;
  unit: string;
  quality: string;
  signalType?: string;
}

export function formatTagValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "—";
    const abs = Math.abs(value);
    return value.toFixed(abs >= 100 ? 0 : abs >= 10 ? 1 : 2);
  }
  return String(value);
}

/** Tags for an asset: live frames first (in tag-id order), then configured tags without data. */
export function assetTagRows(
  assetId: string,
  tags: Record<string, TagFrame>,
  tagIndex: Record<string, TagIndexEntry> = {},
  declared: string[] = [],
  limit = 8,
): TagRow[] {
  const ids = new Set<string>(declared);
  for (const [id, meta] of Object.entries(tagIndex)) if (meta?.asset_id === assetId) ids.add(id);
  for (const frame of Object.values(tags)) if (frame.asset_id === assetId) ids.add(frame.tag_id);
  const rows = [...ids].sort().map((tagId): TagRow => {
    const frame = tags[tagId];
    const meta = tagIndex[tagId];
    const row: TagRow = {
      tagId,
      value: formatTagValue(frame?.value),
      unit: frame?.unit || meta?.unit || "",
      quality: frame?.quality ?? "no data",
    };
    if (meta?.signal_type) row.signalType = meta.signal_type;
    return row;
  });
  rows.sort((a, b) => Number(b.quality !== "no data") - Number(a.quality !== "no data"));
  return rows.slice(0, limit);
}

/**
 * Running = the asset draws current or power right now (from live tags, good quality). Only used
 * for cosmetic cues (lamp lens lit, drive display "RUN") — never inferred from status.
 */
export function runningAssets(tags: Record<string, TagFrame>, tagIndex: Record<string, TagIndexEntry> = {}): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const frame of Object.values(tags)) {
    if (String(frame.quality).toUpperCase() !== "GOOD" || typeof frame.value !== "number") continue;
    const signal = tagIndex[frame.tag_id]?.signal_type ?? "";
    const unit = frame.unit || tagIndex[frame.tag_id]?.unit || "";
    const isFlow = /current|power/.test(signal) || unit === "A" || unit === "W" || unit === "kW";
    if (isFlow && Math.abs(frame.value) > 0.05) out[frame.asset_id] = true;
  }
  return out;
}

export function assetAlarms(assetId: string, alarms: ActiveAlarm[]): ActiveAlarm[] {
  return alarms
    .filter((a) => a.asset_id === assetId)
    .sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9) || a.raised_at.localeCompare(b.raised_at));
}
