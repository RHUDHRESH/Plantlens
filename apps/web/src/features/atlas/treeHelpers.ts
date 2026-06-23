import type { Situation } from "../../app/schemas/situation";
import type { TagFrame } from "../../app/schemas/tagFrame";
import type { AtlasTreeNode, DataQuality } from "./types";

const TAG_UNITS: Record<string, string> = {
  PV_101_V: "V",
  PV_101_I: "A",
  BAT_101_V: "V",
  BAT_101_I: "A",
  BUS_101_V: "V",
  INV_102_V: "V",
  INV_102_I: "A",
  VFD_V: "V",
  VFD_I: "A",
  MOTOR_301_RPM: "rpm",
  MOTOR_301_VIB: "mm/s",
  MOTOR_301_TEMP: "°C",
};

export function getUnitForTag(tagId: string): string {
  return TAG_UNITS[tagId] ?? "";
}

export function tagNumericValue(frame: TagFrame | undefined): number | null {
  if (!frame || frame.quality !== "GOOD") return null;
  if (typeof frame.value === "number") return frame.value;
  if (typeof frame.value === "string" && frame.value.trim() !== "") {
    const parsed = Number(frame.value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function formatTreeValue(tagId: string, value: number | null): string {
  if (value === null) return "—";
  if (tagId.includes("RPM") || tagId.endsWith("_I")) return value.toFixed(1);
  return value.toFixed(1);
}

function worstQuality(current: DataQuality, next: DataQuality): DataQuality {
  if (current === "BAD" || next === "BAD") return "BAD";
  if (current === "UNCERTAIN" || next === "UNCERTAIN") return "UNCERTAIN";
  return "GOOD";
}

export function walkTreeForQuality(
  node: AtlasTreeNode,
  tags: Record<string, TagFrame>,
  situations: Situation[],
  assetStatus: Record<string, string>,
  result: Record<string, DataQuality>,
): void {
  if (node.equipment_id) {
    let worst: DataQuality = "GOOD";
    for (const tagId of node.tags ?? []) {
      const frame = tags[tagId];
      const q = frame?.quality ?? "BAD";
      worst = worstQuality(worst, q);
    }
    const status = assetStatus[node.equipment_id];
    if (status === "critical") worst = "BAD";
    else if (status === "warning" || status === "sensor_bad") worst = worstQuality(worst, "UNCERTAIN");

    const inSituation = situations.some((s) =>
      (s.affected_asset_ids ?? []).includes(node.equipment_id!),
    );
    if (inSituation && worst !== "BAD") worst = "UNCERTAIN";

    result[node.equipment_id] = worst;
  }

  node.children?.forEach((child) =>
    walkTreeForQuality(child, tags, situations, assetStatus, result),
  );
}

export function walkTreeForValues(
  node: AtlasTreeNode,
  tags: Record<string, TagFrame>,
  result: Record<string, number | null>,
): void {
  node.tags?.forEach((tagId) => {
    result[tagId] = tagNumericValue(tags[tagId]);
  });
  node.children?.forEach((child) => walkTreeForValues(child, tags, result));
}

export function buildCausalPath(situation: Situation | null): string[] {
  if (!situation) return [];
  if (situation.causal_path?.length) return situation.causal_path;
  const affected = situation.affected_asset_ids ?? [];
  if (affected.length) return affected;
  return situation.root_asset_id ? [situation.root_asset_id] : [];
}

export function alarmsInLastTenMinutes(
  alarms: Array<{ raised_at: string }>,
  nowMs = Date.now(),
): number {
  const windowMs = 10 * 60 * 1000;
  return alarms.filter((alarm) => {
    const ts = Date.parse(alarm.raised_at);
    return Number.isFinite(ts) && nowMs - ts <= windowMs;
  }).length;
}