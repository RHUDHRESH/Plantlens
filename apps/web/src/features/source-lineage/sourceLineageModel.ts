import type { ActiveAlarm } from "../../api/types";
import type { CalmCard } from "../../app/schemas/calmCard";
import type { Situation } from "../../app/schemas/situation";
import type { TagFrame } from "../../app/schemas/tagFrame";
import type { MapNode } from "../maps2d/mapTypes";
import type { Map3DNode } from "../ops3d/map3dTypes";
import type {
  AssetSourceLineage,
  SourceContractFamily,
  SourceEditTargetKind,
  SourceLineageRef,
  StudioOpenIntent,
} from "./sourceLineageTypes";

export interface AuthoredBundleInput {
  plant?: {
    assets: Array<{ id: string; type: string; display_name: string }>;
  };
  tag_map?: {
    tags: Array<{ tag: string; asset_id: string }>;
  };
  alarm_rules?: {
    rules: Array<{ id: string; tag: string; asset_id?: string; message?: string }>;
  };
  causal_graph?: {
    nodes: Array<{ id: string; label?: string }>;
    edges: Array<{ id: string; from: string; to: string }>;
  };
  action_envelope?: {
    actions: Array<{ id: string; label: string; target_asset_id?: string }>;
  };
}

export interface BuildAssetSourceLineageParams {
  assetId: string;
  nodes2d: MapNode[];
  nodes3d: Map3DNode[];
  tags: Record<string, TagFrame>;
  alarms: ActiveAlarm[];
  activeSituation: Situation | null;
  calmCard: CalmCard | null;
  compiledBundle?: unknown;
  authoredBundle?: AuthoredBundleInput;
}

const FAMILY_ORDER: Record<SourceContractFamily, number> = {
  plant: 0,
  tag_map: 1,
  alarm_rules: 2,
  causal_graph: 3,
  action_envelope: 4,
  hmi_view_model: 5,
  runtime: 6,
};

const KIND_ORDER: Record<SourceEditTargetKind, number> = {
  asset: 0,
  tag: 1,
  alarm_rule: 2,
  causal_edge: 3,
  action: 4,
  role_view: 5,
  compiled_hmi_node: 6,
};

const AUTHORED_WARNINGS: Array<{ key: keyof AuthoredBundleInput; message: string }> = [
  { key: "plant", message: "Authored plant contract not loaded in frontend yet." },
  { key: "tag_map", message: "Authored tag map not loaded in frontend yet." },
  { key: "alarm_rules", message: "Authored alarm rules not loaded in frontend yet." },
  { key: "causal_graph", message: "Authored causal graph not loaded in frontend yet." },
];

function tierOrder(ref: SourceLineageRef): number {
  if (ref.authored) return 0;
  if (ref.family === "hmi_view_model") return 1;
  return 2;
}

function sortRefs(refs: SourceLineageRef[]): SourceLineageRef[] {
  return [...refs].sort((a, b) => {
    const tier = tierOrder(a) - tierOrder(b);
    if (tier !== 0) return tier;
    const family = FAMILY_ORDER[a.family] - FAMILY_ORDER[b.family];
    if (family !== 0) return family;
    const kind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (kind !== 0) return kind;
    return a.id.localeCompare(b.id);
  });
}

function runtimeRef(
  kind: SourceEditTargetKind,
  id: string,
  label: string,
  path: string,
  reason: string,
): SourceLineageRef {
  return {
    family: "runtime",
    kind,
    id,
    label,
    path,
    authored: false,
    editable: false,
    reason,
  };
}

function compiledRef(
  id: string,
  label: string,
  path: string,
  reason: string,
): SourceLineageRef {
  return {
    family: "hmi_view_model",
    kind: "compiled_hmi_node",
    id,
    label,
    path,
    authored: false,
    editable: false,
    reason,
  };
}

function authoredRef(
  family: SourceContractFamily,
  kind: SourceEditTargetKind,
  id: string,
  label: string,
  path: string,
  reason: string,
): SourceLineageRef {
  return {
    family,
    kind,
    id,
    label,
    path,
    authored: true,
    editable: true,
    reason,
  };
}

export function isEditableSourceRef(ref: SourceLineageRef): boolean {
  return ref.authored && ref.editable;
}

export function buildStudioOpenIntent(ref: SourceLineageRef): StudioOpenIntent {
  return {
    targetKind: ref.kind,
    targetId: ref.id,
    family: ref.family,
    mode: isEditableSourceRef(ref) ? "edit_intent" : "inspect",
  };
}

export function buildAssetSourceLineage(params: BuildAssetSourceLineageParams): AssetSourceLineage {
  const {
    assetId,
    nodes2d,
    nodes3d,
    tags,
    alarms,
    activeSituation,
    calmCard,
    authoredBundle,
  } = params;

  const node2d = nodes2d.find((n) => n.id === assetId);
  const node3d = nodes3d.find((n) => n.id === assetId);
  const plantAsset = authoredBundle?.plant?.assets.find((a) => a.id === assetId);

  const assetLabel = node2d?.label ?? node3d?.label ?? plantAsset?.display_name ?? assetId;
  const assetType = node2d?.asset_type ?? node3d?.asset_type ?? plantAsset?.type ?? "unknown";

  const refs: SourceLineageRef[] = [];
  const tagIds: string[] = [];
  const alarmIds: string[] = [];
  const causalEdgeIds: string[] = [];
  const actionIds: string[] = [];
  const warnings: string[] = [];

  if (authoredBundle?.plant) {
    const asset = authoredBundle.plant.assets.find((a) => a.id === assetId);
    if (asset) {
      refs.push(
        authoredRef(
          "plant",
          "asset",
          asset.id,
          asset.display_name,
          `plant.assets[${asset.id}]`,
          "Authored plant structure asset",
        ),
      );
    }
  }

  if (authoredBundle?.tag_map) {
    for (const tag of authoredBundle.tag_map.tags) {
      if (tag.asset_id !== assetId) continue;
      tagIds.push(tag.tag);
      refs.push(
        authoredRef(
          "tag_map",
          "tag",
          tag.tag,
          tag.tag,
          `tag_map.tags[${tag.tag}]`,
          "Authored tag map entry",
        ),
      );
    }
  }

  if (authoredBundle?.alarm_rules) {
    const assetTagIds = new Set(
      (authoredBundle.tag_map?.tags ?? [])
        .filter((t) => t.asset_id === assetId)
        .map((t) => t.tag),
    );
    for (const rule of authoredBundle.alarm_rules.rules) {
      const onAsset =
        rule.asset_id === assetId || (rule.tag && assetTagIds.has(rule.tag));
      if (!onAsset) continue;
      alarmIds.push(rule.id);
      refs.push(
        authoredRef(
          "alarm_rules",
          "alarm_rule",
          rule.id,
          rule.message ?? rule.id,
          `alarm_rules.rules[${rule.id}]`,
          "Authored alarm rule",
        ),
      );
    }
  }

  if (authoredBundle?.causal_graph) {
    for (const edge of authoredBundle.causal_graph.edges) {
      if (edge.from !== assetId && edge.to !== assetId) continue;
      causalEdgeIds.push(edge.id);
      refs.push(
        authoredRef(
          "causal_graph",
          "causal_edge",
          edge.id,
          `${edge.from} → ${edge.to}`,
          `causal_graph.edges[${edge.id}]`,
          "Authored causal graph edge",
        ),
      );
    }
  }

  if (authoredBundle?.action_envelope) {
    for (const action of authoredBundle.action_envelope.actions) {
      if (action.target_asset_id !== assetId) continue;
      actionIds.push(action.id);
      refs.push(
        authoredRef(
          "action_envelope",
          "action",
          action.id,
          action.label,
          `action_envelope.actions[${action.id}]`,
          "Authored action envelope item",
        ),
      );
    }
  }

  if (node2d) {
    refs.push(
      compiledRef(
        `2d:${node2d.id}`,
        node2d.label,
        `hmi_view_model.map_2d.nodes[${node2d.id}]`,
        "Compiled HMI 2D node — output, not source of truth",
      ),
    );
  }

  if (node3d) {
    refs.push(
      compiledRef(
        `3d:${node3d.id}`,
        node3d.label,
        `hmi_view_model.map_3d.nodes[${node3d.id}]`,
        "Compiled HMI 3D node — output, not source of truth",
      ),
    );
  }

  for (const tag of Object.values(tags)) {
    if (tag.asset_id !== assetId) continue;
    if (!tagIds.includes(tag.tag_id)) tagIds.push(tag.tag_id);
    refs.push(
      runtimeRef(
        "tag",
        tag.tag_id,
        tag.tag_id,
        `runtime.tags[${tag.tag_id}]`,
        "Live runtime tag value",
      ),
    );
  }

  for (const alarm of alarms) {
    if (alarm.asset_id !== assetId) continue;
    if (!alarmIds.includes(alarm.alarm_id)) alarmIds.push(alarm.alarm_id);
    refs.push(
      runtimeRef(
        "alarm_rule",
        alarm.alarm_id,
        alarm.message || alarm.alarm_id,
        `runtime.alarms[${alarm.alarm_id}]`,
        "Active runtime alarm",
      ),
    );
  }

  if (activeSituation?.root_asset_id === assetId) {
    refs.push(
      runtimeRef(
        "asset",
        activeSituation.situation_id,
        activeSituation.title,
        `runtime.situations[${activeSituation.situation_id}]`,
        "Active situation root asset",
      ),
    );
  }

  if (activeSituation) {
    const causalPath = activeSituation.causal_path ?? [];
    if (causalPath.includes(assetId) && activeSituation.root_asset_id !== assetId) {
      refs.push(
        runtimeRef(
          "asset",
          `${activeSituation.situation_id}:path`,
          activeSituation.title,
          `runtime.situations[${activeSituation.situation_id}].causal_path`,
          "Asset on active situation causal path",
        ),
      );
    }
  }

  if (calmCard?.root_asset_id === assetId) {
    refs.push(
      runtimeRef(
        "asset",
        calmCard.card_id,
        calmCard.title,
        `runtime.calm_card[${calmCard.card_id}]`,
        "Calm Card root asset",
      ),
    );
    if (calmCard.first_signal) {
      refs.push(
        runtimeRef(
          "tag",
          calmCard.first_signal.alarm_id,
          calmCard.first_signal.message,
          `runtime.calm_card[${calmCard.card_id}].first_signal`,
          "Calm Card first signal",
        ),
      );
    }
    if (calmCard.recommended_first_check) {
      actionIds.push(calmCard.recommended_first_check.action_id);
      refs.push(
        runtimeRef(
          "action",
          calmCard.recommended_first_check.action_id,
          calmCard.recommended_first_check.label,
          `runtime.calm_card[${calmCard.card_id}].recommended_first_check`,
          "Calm Card recommended check (runtime projection)",
        ),
      );
    }
  }

  if (!authoredBundle) {
    for (const { message } of AUTHORED_WARNINGS) {
      warnings.push(message);
    }
  } else {
    for (const { key, message } of AUTHORED_WARNINGS) {
      if (!authoredBundle[key]) warnings.push(message);
    }
  }

  tagIds.sort();
  alarmIds.sort();
  causalEdgeIds.sort();
  actionIds.sort();

  return {
    assetId,
    assetLabel,
    assetType,
    refs: sortRefs(refs),
    tagIds,
    alarmIds,
    causalEdgeIds,
    actionIds,
    warnings: [...new Set(warnings)],
  };
}