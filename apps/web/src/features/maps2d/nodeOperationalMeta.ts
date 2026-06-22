import type { ActiveAlarm } from "../../api/types";
import type { TagFrame } from "../../app/schemas/tagFrame";

export interface MapNodeOperationalMeta {
  assetId: string;
  alarmCount: number;
  criticalAlarmCount: number;
  tagCount: number;
  badQualityCount: number;
  primaryValueLabel: string | null;
}

function formatPrimaryValue(tag: TagFrame): string {
  return `${tag.tag_id}: ${String(tag.value ?? "—")} ${tag.unit}`;
}

export function buildNodeOperationalMeta(params: {
  assetIds: string[];
  tags: Record<string, TagFrame>;
  alarms: ActiveAlarm[];
}): Record<string, MapNodeOperationalMeta> {
  const { assetIds, tags, alarms } = params;
  const result: Record<string, MapNodeOperationalMeta> = {};

  for (const assetId of assetIds) {
    const assetTags = Object.values(tags)
      .filter((t) => t.asset_id === assetId)
      .sort((a, b) => a.tag_id.localeCompare(b.tag_id));
    const assetAlarms = alarms
      .filter((a) => a.asset_id === assetId)
      .sort((a, b) => a.alarm_id.localeCompare(b.alarm_id));

    const goodTag = assetTags.find((t) => t.quality === "GOOD");
    const primaryTag = goodTag ?? assetTags[0];
    const primaryValueLabel = primaryTag ? formatPrimaryValue(primaryTag) : null;

    result[assetId] = {
      assetId,
      alarmCount: assetAlarms.length,
      criticalAlarmCount: assetAlarms.filter((a) => a.severity === "critical").length,
      tagCount: assetTags.length,
      badQualityCount: assetTags.filter((t) => t.quality !== "GOOD").length,
      primaryValueLabel,
    };
  }

  return result;
}