/**
 * Calm Card composition: the backend's CalmCard + Situation (score_breakdown, loop_note,
 * unexplained alarms) → one view model in the DESIGN_SYSTEM visual priority order:
 * title → root asset → first signal → evidence chain → best check → blocked actions → raw alarms.
 * Pure and deterministic; nothing is diagnosed here.
 */
import type { ActiveAlarm } from "../../api/types";
import type { CalmCard } from "../../app/schemas/calmCard";
import type { Situation } from "../../app/schemas/situation";
import type { StatusKind } from "../../components/ui/primitives";
import { formatOffset, parseTs } from "../operational-map/format";
import type { PlantModel } from "../operational-map/plantModel";

export interface ScoreBreakdown {
  timing: number;
  coverage: number;
  fingerprint: number;
  quality_penalty: number;
  contradictions: number;
  margin: number;
  competitor?: string | null;
}

/** Situation fields the runtime sends beyond the shared contract mirror. */
export interface RuntimeSituation extends Situation {
  confidence_score?: number | null;
  confidence_reason?: string | null;
  score_breakdown?: ScoreBreakdown | null;
  loop_note?: string | null;
  unexplained_alarm_ids?: string[] | null;
  deterministic_trace_id?: string | null;
}

export type RuntimeCalmCard = Omit<CalmCard, "time_to_consequence"> & {
  confidence_reason?: string | null;
  time_to_consequence?: {
    target_tag: string;
    target_label: string;
    state: string;
    seconds_low?: number | null;
    seconds_mid?: number | null;
    seconds_high?: number | null;
    reason?: string | null;
  } | null;
};

export interface EvidenceStep {
  order: number;
  alarmId: string;
  message: string;
  assetId: string;
  assetName: string;
  ts: number;
  offset: string;
  isFirst: boolean;
  isRootAsset: boolean;
}

export interface ScoreTerm {
  key: "timing" | "coverage" | "fingerprint" | "quality" | "contradictions";
  label: string;
  /** 0..1 for bars; contradictions use count. */
  value: number;
  display: string;
  explain: string;
  /** true when the term argues against the root. */
  concern: boolean;
}

export interface CalmCardView {
  situationId: string;
  title: string;
  status: StatusKind;
  severityLabel: string;
  since: number | null;
  rootAssetId: string;
  rootAssetName: string;
  rootAssetType: string | null;
  firstSignal: { message: string; assetName: string; ts: number | null; tagId: string | null; value: unknown; unit: string | null } | null;
  evidence: EvidenceStep[];
  bestCheck: { label: string; risk: string; requiresIsolation: boolean } | null;
  blocked: { label: string; reason: string }[];
  whyItMatters: string | null;
  rawCount: number;
  rawIds: string[];
  confidence: {
    bucket: "low" | "medium" | "high" | "unknown";
    score: number | null;
    reason: string | null;
    terms: ScoreTerm[];
    margin: { value: number; competitor: string | null; competitorName: string | null } | null;
  };
  loopNote: string | null;
  unexplained: { id: string; message: string; assetName: string }[];
  timeToConsequence: { label: string; text: string } | null;
  authority: string;
  traceId: string | null;
}

function severityStatus(sev: string | undefined): { status: StatusKind; label: string } {
  if (sev === "critical") return { status: "critical", label: "Critical" };
  if (sev === "warning") return { status: "high", label: "Warning" };
  return { status: "low", label: "Advisory" };
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function scoreTerms(b: ScoreBreakdown): ScoreTerm[] {
  return [
    {
      key: "timing",
      label: "Timing",
      value: b.timing,
      display: pct(b.timing),
      explain: `${pct(b.timing)} of the grouped alarms began after the root's first alarm.`,
      concern: b.timing < 0.8,
    },
    {
      key: "coverage",
      label: "Coverage",
      value: b.coverage,
      display: pct(b.coverage),
      explain: `The root explains ${pct(b.coverage)} of the alarms in scope inside their approved lag windows.`,
      concern: b.coverage < 0.8,
    },
    {
      key: "fingerprint",
      label: "Fingerprint",
      value: b.fingerprint,
      display: pct(b.fingerprint),
      explain: "Match with the engineer-authored evidence and root-cause rules for this asset.",
      concern: b.fingerprint < 0.6,
    },
    {
      key: "quality",
      label: "Data quality",
      value: 1 - b.quality_penalty,
      display: pct(1 - b.quality_penalty),
      explain:
        b.quality_penalty > 0
          ? `${pct(b.quality_penalty)} of the root's evidence tags are stale, bad or missing.`
          : "All of the root's evidence tags are reporting GOOD quality.",
      concern: b.quality_penalty > 0,
    },
    {
      key: "contradictions",
      label: "Contradictions",
      value: b.contradictions,
      display: String(b.contradictions),
      explain:
        b.contradictions > 0
          ? `${b.contradictions} downstream alarm(s) began too early or moved against the approved polarity.`
          : "No alarm started before the root or moved against the approved polarity.",
      concern: b.contradictions > 0,
    },
  ];
}

function ttcText(ttc: NonNullable<RuntimeCalmCard["time_to_consequence"]>): string | null {
  if (ttc.state === "stable") return "Stable — not approaching the limit.";
  if (ttc.state === "unknown") return null;
  if (ttc.state === "exceeded") return "Limit already exceeded.";
  const lo = ttc.seconds_low;
  const hi = ttc.seconds_high;
  if (lo == null || hi == null) return "Approaching the limit.";
  if (hi < 1) return "At the limit now.";
  const fmt = (s: number) => (s >= 90 ? `${Math.round(s / 60)} min` : `${Math.max(0, Math.round(s))} s`);
  return lo < 1 ? `Could reach the limit within ${fmt(hi)}.` : `Reaches the limit in ${fmt(lo)}–${fmt(hi)}.`;
}

export function composeCalmCard(
  card: RuntimeCalmCard | null | undefined,
  situation: RuntimeSituation | null | undefined,
  ctx: { alarms?: ActiveAlarm[]; model?: PlantModel } = {},
): CalmCardView | null {
  if (!card && !situation) return null;
  const model = ctx.model;
  const nameOf = (id: string | null | undefined) => (id ? (model?.assetById[id]?.name ?? id) : "—");
  const alarmById = new Map((ctx.alarms ?? []).map((a) => [a.alarm_id, a]));
  const rootAssetId = card?.root_asset_id ?? situation?.root_asset_id ?? "";
  const sev = severityStatus(card?.severity ?? situation?.severity);

  const rawChain =
    card?.evidence_chain?.map((e) => ({ alarmId: e.alarm_id, assetId: e.asset_id, message: e.message, ts: parseTs(e.timestamp) })) ??
    situation?.evidence.map((e) => ({ alarmId: e.alarm_id, assetId: e.asset_id, message: e.reason, ts: parseTs(e.timestamp) })) ??
    [];
  const chain = [...rawChain].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0) || a.alarmId.localeCompare(b.alarmId));
  const t0 = chain[0]?.ts ?? null;
  const evidence: EvidenceStep[] = chain.map((e, i) => ({
    order: i + 1,
    alarmId: e.alarmId,
    message: e.message,
    assetId: e.assetId,
    assetName: nameOf(e.assetId),
    ts: e.ts ?? 0,
    offset: t0 !== null && e.ts !== null ? (i === 0 ? "t₀" : formatOffset(e.ts - t0)) : "",
    isFirst: i === 0,
    isRootAsset: e.assetId === rootAssetId,
  }));

  const fs = card?.first_signal;
  const firstSignal = fs
    ? {
        message: fs.message,
        assetName: nameOf(fs.asset_id),
        ts: parseTs(fs.timestamp),
        tagId: fs.tag_id ?? null,
        value: fs.value ?? null,
        unit: fs.unit ?? (fs.tag_id ? (model?.tagById[fs.tag_id]?.unit ?? null) : null),
      }
    : evidence[0]
      ? { message: evidence[0].message, assetName: evidence[0].assetName, ts: evidence[0].ts, tagId: null, value: null, unit: null }
      : null;

  const rawIds = card?.raw_alarm_ids ?? situation?.grouped_alarm_ids ?? [];
  const breakdown = situation?.score_breakdown ?? null;
  const unexplainedIds = situation?.unexplained_alarm_ids ?? [];
  const ttc = card?.time_to_consequence;
  const ttcTextValue = ttc ? ttcText(ttc) : null;

  return {
    situationId: card?.situation_id ?? situation?.situation_id ?? "",
    title: card?.title ?? situation?.title ?? "Situation",
    status: sev.status,
    severityLabel: sev.label,
    since: parseTs(card?.created_at ?? situation?.created_at ?? null),
    rootAssetId,
    rootAssetName: card?.root_asset_name ?? situation?.root_asset_name ?? nameOf(rootAssetId),
    rootAssetType: model?.assetById[rootAssetId]?.type ?? null,
    firstSignal,
    evidence,
    bestCheck: card?.recommended_first_check
      ? {
          label: card.recommended_first_check.label,
          risk: card.recommended_first_check.risk_level,
          requiresIsolation: !!card.recommended_first_check.requires_isolation,
        }
      : null,
    blocked: (card?.blocked_actions ?? []).map((b) => ({ label: b.label, reason: b.reason })),
    whyItMatters: card?.why_it_matters ?? null,
    rawCount: card?.raw_alarm_count ?? rawIds.length,
    rawIds,
    confidence: {
      bucket: card?.confidence ?? situation?.confidence ?? "unknown",
      score: situation?.confidence_score ?? null,
      reason: situation?.confidence_reason ?? card?.confidence_reason ?? null,
      terms: breakdown ? scoreTerms(breakdown) : [],
      margin: breakdown
        ? { value: breakdown.margin, competitor: breakdown.competitor ?? null, competitorName: breakdown.competitor ? nameOf(breakdown.competitor) : null }
        : null,
    },
    loopNote: situation?.loop_note ?? null,
    unexplained: unexplainedIds.map((id) => {
      const a = alarmById.get(id);
      return { id, message: a?.message ?? id, assetName: nameOf(a?.asset_id) };
    }),
    timeToConsequence: ttc && ttcTextValue ? { label: ttc.target_label, text: ttcTextValue } : null,
    authority: card?.operator_authority ?? "PlantLens is advisory. It does not trip or control equipment.",
    traceId: situation?.deterministic_trace_id ?? null,
  };
}
