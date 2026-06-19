/** Mirror of packages/contracts/tag_frame.schema.json */

import type { TagQuality, TagSource, TagValue } from "./common";

export interface TagFrame {
  tag_id: string;
  asset_id: string;
  value: TagValue;
  unit: string;
  quality: TagQuality;
  /** RFC3339 UTC */
  timestamp: string;
  source: TagSource;
  seq?: number;
  /** RFC3339 UTC */
  ingest_ts?: string;
  gateway_id?: string;
  scenario_id?: string;
}

/** Dedupe key per contract: (source, tag_id, seq, timestamp). */
export function tagFrameIdentityKey(frame: TagFrame): string {
  return `${frame.source}:${frame.tag_id}:${frame.seq ?? ""}:${frame.timestamp}`;
}