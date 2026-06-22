import type { ActiveAlarm } from "../../api/types";
import type { TagFrame } from "../../app/schemas/tagFrame";
import type { CausalPathViewModel } from "../causal-path";
import type { MapLayerId, UserRole } from "../operational-map";
import type { AssetStatus, MapNode } from "../maps2d/mapTypes";
import {
  buildCommandRegistryParams,
  getOperationalCommandDocuments,
  type CommandRegistryParams,
} from "./commandRegistry";
import { expandAliases } from "./thesaurus";
import { buildDocumentTokens } from "./tokenizer";
import type { OperationalSearchDocument, OperationalSearchIndex } from "./searchTypes";

export interface BuildOperationalSearchIndexParams {
  nodes: MapNode[];
  assetStatus: Record<string, AssetStatus>;
  tags: Record<string, TagFrame>;
  alarms: ActiveAlarm[];
  causalPathViewModel: CausalPathViewModel;
  role: UserRole;
  visibleLayers: Record<MapLayerId, boolean>;
  rootAssetId: string | null;
  mapMode: "2d" | "3d";
  showLegend: boolean;
  density: "comfortable" | "compact";
  builtAt?: string;
}

function statusBoost(status: string | undefined): number {
  if (status === "critical") return 20;
  if (status === "warning") return 10;
  return 0;
}

function shouldIncludeTags(role: UserRole, visibleLayers: Record<MapLayerId, boolean>): boolean {
  if (role === "manager") return false;
  if (role === "engineer" || role === "maintenance") return true;
  return visibleLayers.tags ?? false;
}

function buildAssetDocuments(
  nodes: MapNode[],
  assetStatus: Record<string, AssetStatus>,
  rootAssetId: string | null,
  pathAssetIds: Set<string>,
): OperationalSearchDocument[] {
  return nodes.map((node) => {
    const status = assetStatus[node.id] ?? "unknown";
    let boost = statusBoost(status);
    if (rootAssetId && node.id === rootAssetId) boost += 40;
    else if (pathAssetIds.has(node.id)) boost += 25;

    const tokens = buildDocumentTokens(node.label, node.id, node.asset_type, status);
    const aliases = expandAliases(tokens);

    return {
      id: `asset:${node.id}`,
      kind: "asset" as const,
      title: node.label,
      subtitle: `${node.id} · ${node.asset_type} · ${status}`,
      assetId: node.id,
      status,
      tokens,
      aliases,
      boost,
    };
  });
}

function buildTagDocuments(
  tags: Record<string, TagFrame>,
  params: BuildOperationalSearchIndexParams,
  pathAssetIds: Set<string>,
): OperationalSearchDocument[] {
  if (!shouldIncludeTags(params.role, params.visibleLayers)) return [];

  return Object.values(tags)
    .sort((a, b) => a.tag_id.localeCompare(b.tag_id))
    .map((tag) => {
      let boost = 0;
      if (tag.quality !== "GOOD") boost += 25;
      if (params.rootAssetId && tag.asset_id === params.rootAssetId) boost += 15;
      if (tag.asset_id && pathAssetIds.has(tag.asset_id)) boost += 10;

      const valueLabel = `${String(tag.value ?? "—")} ${tag.unit}`.trim();
      const tokens = buildDocumentTokens(tag.tag_id, tag.asset_id ?? "", tag.quality, valueLabel, tag.unit);
      const aliases = expandAliases(tokens);

      return {
        id: `tag:${tag.tag_id}`,
        kind: "tag" as const,
        title: tag.tag_id,
        subtitle: `${tag.asset_id ?? "unknown"} · ${valueLabel} · ${tag.quality}`,
        assetId: tag.asset_id ?? undefined,
        tagId: tag.tag_id,
        status: tag.quality,
        tokens,
        aliases,
        boost,
      };
    });
}

function buildAlarmDocuments(
  alarms: ActiveAlarm[],
  rootAssetId: string | null,
  pathAssetIds: Set<string>,
): OperationalSearchDocument[] {
  return [...alarms]
    .sort((a, b) => a.alarm_id.localeCompare(b.alarm_id))
    .map((alarm) => {
      let boost = alarm.severity === "critical" ? 40 : 20;
      if (rootAssetId && alarm.asset_id === rootAssetId) boost += 20;
      if (alarm.asset_id && pathAssetIds.has(alarm.asset_id)) boost += 10;

      const tokens = buildDocumentTokens(
        alarm.message,
        alarm.alarm_id,
        alarm.asset_id ?? "",
        alarm.severity,
        alarm.tag_id ?? "",
      );
      const aliases = expandAliases(tokens);

      return {
        id: `alarm:${alarm.alarm_id}`,
        kind: "alarm" as const,
        title: alarm.message,
        subtitle: `${alarm.asset_id ?? "unknown asset"} · ${alarm.severity}`,
        assetId: alarm.asset_id ?? undefined,
        alarmId: alarm.alarm_id,
        severity: alarm.severity,
        tokens,
        aliases,
        boost,
      };
    });
}

function buildCausalStepDocuments(
  causalPathViewModel: CausalPathViewModel,
): OperationalSearchDocument[] {
  if (!causalPathViewModel.hasActivePath) return [];

  return causalPathViewModel.steps.map((step) => {
    let boost = 0;
    if (step.isRoot) boost += 50;
    if (step.isSelected) boost += 20;
    if (step.isFocused) boost += 15;

    const tokens = buildDocumentTokens(
      step.label,
      step.assetId,
      step.kind,
      step.status,
      String(step.index + 1),
    );
    const aliases = expandAliases(tokens);

    return {
      id: `causal:${step.assetId}`,
      kind: "causal_step" as const,
      title: `${step.index + 1}. ${step.label}`,
      subtitle: `${step.kind} · ${step.status}`,
      assetId: step.assetId,
      status: step.status,
      tokens,
      aliases,
      boost,
    };
  });
}

export function buildOperationalSearchIndex(
  params: BuildOperationalSearchIndexParams,
): OperationalSearchIndex {
  const pathAssetIds = new Set(params.causalPathViewModel.pathAssetIds);

  const commandParams: CommandRegistryParams = buildCommandRegistryParams({
    role: params.role,
    mapMode: params.mapMode,
    showLegend: params.showLegend,
    density: params.density,
    rootAssetId: params.rootAssetId,
    alarmCount: params.alarms.length,
    visibleLayers: params.visibleLayers,
  });

  const documents: OperationalSearchDocument[] = [
    ...buildAssetDocuments(params.nodes, params.assetStatus, params.rootAssetId, pathAssetIds),
    ...buildTagDocuments(params.tags, params, pathAssetIds),
    ...buildAlarmDocuments(params.alarms, params.rootAssetId, pathAssetIds),
    ...buildCausalStepDocuments(params.causalPathViewModel),
    ...getOperationalCommandDocuments(commandParams),
  ];

  return {
    documents,
    builtAt: params.builtAt ?? new Date(0).toISOString(),
  };
}