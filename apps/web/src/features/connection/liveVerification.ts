export type LiveVerificationState =
  | "not_bound"
  | "pending_commit"
  | "committed_waiting"
  | "live_good"
  | "live_uncertain"
  | "live_bad"
  | "live_stale"
  | "live_missing";

export interface LiveVerificationInput {
  tagId: string | null | undefined;
  pending: boolean;
  committed: boolean;
  runtimeTags: Record<string, unknown>;
}

export interface RuntimeTagRecord {
  tag_id?: string;
  tagId?: string;
  value?: unknown;
  unit?: string | null;
  quality?: string | null;
  timestamp?: string | null;
  ts?: string | null;
  asset_id?: string | null;
  assetId?: string | null;
  source?: string | null;
}

export interface LiveVerificationResult {
  state: LiveVerificationState;
  label: string;
  detail: string;
  value: unknown;
  unit: string | null;
  quality: string | null;
  timestamp: string | null;
  assetId: string | null;
  source: string | null;
}

const STATE_LABELS: Record<LiveVerificationState, string> = {
  not_bound: "Not bound",
  pending_commit: "Pending commit",
  committed_waiting: "Waiting for runtime",
  live_good: "Live",
  live_uncertain: "Uncertain",
  live_bad: "Bad",
  live_stale: "Stale",
  live_missing: "Missing",
};

const STATE_DETAILS: Record<LiveVerificationState, string> = {
  not_bound: "Select a channel and bind it to a tag.",
  pending_commit: "Binding is staged but not committed to the model.",
  committed_waiting: "Model committed; waiting for the first runtime TagFrame.",
  live_good: "Runtime TagFrame received with GOOD quality.",
  live_uncertain: "Runtime TagFrame received but quality is uncertain.",
  live_bad: "Runtime TagFrame received with BAD quality. Value hidden.",
  live_stale: "Runtime TagFrame is stale. Value hidden.",
  live_missing: "Runtime reports this tag as missing.",
};

function asRecord(value: unknown): RuntimeTagRecord | null {
  if (typeof value !== "object" || value === null) return null;
  return value as RuntimeTagRecord;
}

export function getRuntimeTag(
  runtimeTags: Record<string, unknown>,
  tagId: string | null | undefined,
): RuntimeTagRecord | null {
  if (!tagId) return null;
  const direct = asRecord(runtimeTags[tagId]);
  if (direct) return direct;

  for (const frame of Object.values(runtimeTags)) {
    const record = asRecord(frame);
    if (!record) continue;
    const id = record.tag_id ?? record.tagId;
    if (id === tagId) return record;
  }
  return null;
}

function qualityToLiveState(quality: string): LiveVerificationState {
  switch (quality) {
    case "GOOD":
      return "live_good";
    case "UNCERTAIN":
      return "live_uncertain";
    case "BAD":
      return "live_bad";
    case "STALE":
      return "live_stale";
    case "MISSING":
      return "live_missing";
    default:
      return "live_uncertain";
  }
}

export function verifyLiveTag(input: LiveVerificationInput): LiveVerificationResult {
  const tagId = input.tagId?.trim() || null;
  const empty: LiveVerificationResult = {
    state: "not_bound",
    label: STATE_LABELS.not_bound,
    detail: STATE_DETAILS.not_bound,
    value: null,
    unit: null,
    quality: null,
    timestamp: null,
    assetId: null,
    source: null,
  };

  if (!tagId) return empty;

  if (input.pending && !input.committed) {
    return { ...empty, state: "pending_commit", label: STATE_LABELS.pending_commit, detail: STATE_DETAILS.pending_commit };
  }

  const frame = getRuntimeTag(input.runtimeTags, tagId);
  if (!frame) {
    if (input.committed) {
      return {
        ...empty,
        state: "committed_waiting",
        label: STATE_LABELS.committed_waiting,
        detail: STATE_DETAILS.committed_waiting,
      };
    }
    return empty;
  }

  const quality = String(frame.quality ?? "UNCERTAIN");
  const state = qualityToLiveState(quality);
  const timestamp = (frame.timestamp ?? frame.ts ?? null) as string | null;
  const assetId = (frame.asset_id ?? frame.assetId ?? null) as string | null;
  const unit = (frame.unit ?? null) as string | null;

  return {
    state,
    label: STATE_LABELS[state],
    detail: STATE_DETAILS[state],
    value: frame.value ?? null,
    unit,
    quality,
    timestamp,
    assetId,
    source: (frame.source ?? null) as string | null,
  };
}

export function formatLiveValue(
  value: unknown,
  unit: string | null | undefined,
  quality: string | null | undefined,
): string {
  const q = quality ?? "";
  if (q === "BAD" || q === "STALE" || q === "MISSING") return "—";

  if (value === null || value === undefined) return "—";
  if (typeof value === "number" && !Number.isFinite(value)) return "—";

  let display: string;
  if (typeof value === "boolean") {
    display = value ? "TRUE" : "FALSE";
  } else if (typeof value === "number") {
    display = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
  } else if (typeof value === "string") {
    if (value.trim() === "" || value === "NaN") return "—";
    display = value;
  } else {
    return "—";
  }

  const u = unit?.trim();
  if (u && display !== "—") return `${display} ${u}`;
  return display;
}

export function formatLastSeen(timestamp: string | null | undefined): string {
  if (!timestamp) return "—";
  const match = timestamp.match(/T(\d{2}:\d{2}:\d{2})/);
  if (match?.[1]) return match[1];
  return timestamp;
}

export function scanRowRuntimeLabel(
  tagId: string | null | undefined,
  pending: boolean,
  committed: boolean,
  runtimeTags: Record<string, unknown>,
): string {
  const result = verifyLiveTag({ tagId, pending, committed, runtimeTags });
  switch (result.state) {
    case "live_good":
      return "Live";
    case "live_bad":
      return "Bad";
    case "live_stale":
      return "Stale";
    case "live_missing":
      return "Missing";
    case "live_uncertain":
      return "Uncertain";
    case "committed_waiting":
      return "Waiting";
    case "pending_commit":
      return "Pending";
    default:
      return "—";
  }
}

export function verificationPillClass(state: LiveVerificationState): string {
  switch (state) {
    case "live_good":
      return "text-healthy";
    case "live_uncertain":
    case "pending_commit":
    case "committed_waiting":
      return "text-advisory";
    case "live_bad":
    case "live_stale":
    case "live_missing":
      return "text-critical";
    default:
      return "text-ink-500";
  }
}

export function verificationDotClass(state: LiveVerificationState): string {
  switch (state) {
    case "live_good":
      return "bg-healthy";
    case "live_uncertain":
    case "pending_commit":
    case "committed_waiting":
      return "bg-advisory";
    case "live_bad":
    case "live_stale":
    case "live_missing":
      return "bg-critical";
    default:
      return "bg-line-strong";
  }
}