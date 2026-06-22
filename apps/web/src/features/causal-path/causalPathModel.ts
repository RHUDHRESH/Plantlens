import type { ActiveAlarm } from "../../api/types";
import type { CalmCard } from "../../app/schemas/calmCard";
import type { Situation } from "../../app/schemas/situation";
import type { TagFrame } from "../../app/schemas/tagFrame";
import type { AssetStatus, MapNode } from "../maps2d/mapTypes";
import type {
  CausalPathAlarmEvidence,
  CausalPathStepKind,
  CausalPathStepViewModel,
  CausalPathTagEvidence,
  CausalPathViewModel,
} from "./causalPathTypes";

export interface BuildCausalPathViewModelParams {
  nodes: MapNode[];
  assetStatus: Record<string, AssetStatus>;
  pathAssetIds: string[];
  affectedAssetIds: string[];
  selectedAssetId: string | null;
  focusedAssetId: string | null;
  tags: Record<string, TagFrame>;
  alarms: ActiveAlarm[];
  activeSituation: Situation | null;
  calmCard: CalmCard | null;
}

const EMPTY_VIEW: CausalPathViewModel = {
  hasActivePath: false,
  situationTitle: null,
  rootAssetId: null,
  firstSignalLabel: null,
  recommendedActionLabel: null,
  pathAssetIds: [],
  steps: [],
  selectedStep: null,
};

function resolveRootAssetId(
  pathAssetIds: string[],
  activeSituation: Situation | null,
  calmCard: CalmCard | null,
): string | null {
  const fromSituation = activeSituation?.root_asset_id ?? null;
  const fromCalm = calmCard?.root_asset_id ?? null;
  const candidate = fromSituation ?? fromCalm ?? pathAssetIds[0] ?? null;
  if (candidate && pathAssetIds.includes(candidate)) return candidate;
  return pathAssetIds[0] ?? null;
}

function resolveStepKind(
  assetId: string,
  index: number,
  pathLength: number,
  rootAssetId: string | null,
  affectedSet: Set<string>,
): CausalPathStepKind {
  if (rootAssetId && assetId === rootAssetId) return "root";
  if (index === pathLength - 1 && assetId !== rootAssetId) return "effect";
  if (affectedSet.has(assetId) && assetId !== rootAssetId && index !== pathLength - 1) {
    return "downstream";
  }
  if (index > 0 && index < pathLength - 1) return "cause";
  return "unknown";
}

function buildTagEvidence(assetId: string, tags: Record<string, TagFrame>): CausalPathTagEvidence[] {
  return Object.values(tags)
    .filter((t) => t.asset_id === assetId)
    .sort((a, b) => a.tag_id.localeCompare(b.tag_id))
    .map((t) => ({
      tagId: t.tag_id,
      valueLabel: `${String(t.value ?? "—")} ${t.unit}`.trim(),
      quality: t.quality,
      unit: t.unit,
      assetId: t.asset_id,
    }));
}

function buildAlarmEvidence(assetId: string, alarms: ActiveAlarm[]): CausalPathAlarmEvidence[] {
  return alarms
    .filter((a) => a.asset_id === assetId)
    .sort((a, b) => a.alarm_id.localeCompare(b.alarm_id))
    .map((a) => ({
      alarmId: a.alarm_id,
      severity: a.severity,
      message: a.message,
      assetId: a.asset_id,
    }));
}

function resolveSelectedStep(
  steps: CausalPathStepViewModel[],
  selectedAssetId: string | null,
  focusedAssetId: string | null,
  rootAssetId: string | null,
): CausalPathStepViewModel | null {
  if (!steps.length) return null;
  if (selectedAssetId) {
    const selected = steps.find((s) => s.assetId === selectedAssetId);
    if (selected) return selected;
  }
  if (focusedAssetId) {
    const focused = steps.find((s) => s.assetId === focusedAssetId);
    if (focused) return focused;
  }
  if (rootAssetId) {
    const root = steps.find((s) => s.assetId === rootAssetId);
    if (root) return root;
  }
  return steps[0] ?? null;
}

export function buildCausalPathViewModel(params: BuildCausalPathViewModelParams): CausalPathViewModel {
  const { pathAssetIds } = params;
  if (!pathAssetIds.length) return { ...EMPTY_VIEW };

  const nodeById = Object.fromEntries(params.nodes.map((n) => [n.id, n]));
  const affectedSet = new Set(params.affectedAssetIds);
  const rootAssetId = resolveRootAssetId(pathAssetIds, params.activeSituation, params.calmCard);
  const pathLength = pathAssetIds.length;

  const steps: CausalPathStepViewModel[] = pathAssetIds.map((assetId, index) => {
    const node = nodeById[assetId];
    const assetTags = buildTagEvidence(assetId, params.tags);
    const assetAlarms = buildAlarmEvidence(assetId, params.alarms);
    const goodTag = assetTags.find((t) => t.quality === "GOOD");
    const primaryTag = goodTag ?? assetTags[0];
    const isRoot = rootAssetId === assetId;
    const isAffected = affectedSet.has(assetId);

    return {
      assetId,
      label: node?.label ?? assetId,
      assetType: node?.asset_type ?? "unknown",
      index,
      kind: resolveStepKind(assetId, index, pathLength, rootAssetId, affectedSet),
      status: params.assetStatus[assetId] ?? "unknown",
      alarmCount: assetAlarms.length,
      criticalAlarmCount: assetAlarms.filter((a) => a.severity === "critical").length,
      badQualityCount: assetTags.filter((t) => t.quality !== "GOOD").length,
      primaryTagLabel: primaryTag ? `${primaryTag.tagId}: ${primaryTag.valueLabel}` : null,
      alarms: assetAlarms,
      tags: assetTags,
      isRoot,
      isAffected,
      isSelected: params.selectedAssetId === assetId,
      isFocused: params.focusedAssetId === assetId,
    };
  });

  const selected = resolveSelectedStep(
    steps,
    params.selectedAssetId,
    params.focusedAssetId,
    rootAssetId,
  );
  const stepsWithSelection = steps.map((s) => ({
    ...s,
    isSelected: selected?.assetId === s.assetId,
  }));

  const firstSignal = params.calmCard?.first_signal;
  const firstSignalLabel = firstSignal?.message ?? null;
  const recommendedActionLabel = params.calmCard?.recommended_first_check?.label ?? null;

  return {
    hasActivePath: true,
    situationTitle: params.activeSituation?.title ?? params.calmCard?.title ?? null,
    rootAssetId,
    firstSignalLabel,
    recommendedActionLabel,
    pathAssetIds: [...pathAssetIds],
    steps: stepsWithSelection,
    selectedStep: selected
      ? (stepsWithSelection.find((s) => s.assetId === selected.assetId) ?? null)
      : null,
  };
}

export function getNextPathAssetId(
  viewModel: CausalPathViewModel,
  currentAssetId: string,
): string | null {
  const idx = viewModel.pathAssetIds.indexOf(currentAssetId);
  if (idx < 0 || idx >= viewModel.pathAssetIds.length - 1) return null;
  return viewModel.pathAssetIds[idx + 1] ?? null;
}

export function getPreviousPathAssetId(
  viewModel: CausalPathViewModel,
  currentAssetId: string,
): string | null {
  const idx = viewModel.pathAssetIds.indexOf(currentAssetId);
  if (idx <= 0) return null;
  return viewModel.pathAssetIds[idx - 1] ?? null;
}