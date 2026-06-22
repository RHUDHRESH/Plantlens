import type { AuthoredBundleInput } from "../source-lineage/sourceLineageModel";
import type { StudioDraftBundle, StudioDraftFamily, StudioDraftState } from "./studioDraftTypes";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === "string" ? v : "";
}

function hasStringId(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === "string" && record[key] !== "";
}

export function selectAssets(bundle: StudioDraftBundle): Array<Record<string, unknown>> {
  const plant = asRecord(bundle.plant);
  return asArray(plant?.assets)
    .map((a) => asRecord(a))
    .filter((a): a is Record<string, unknown> => a != null && hasStringId(a, "id"));
}

export function selectTags(bundle: StudioDraftBundle): Array<Record<string, unknown>> {
  const tagMap = asRecord(bundle.tag_map);
  return asArray(tagMap?.tags)
    .map((t) => asRecord(t))
    .filter((t): t is Record<string, unknown> => t != null && hasStringId(t, "tag"));
}

export function selectAlarmRules(bundle: StudioDraftBundle): Array<Record<string, unknown>> {
  const rules = asRecord(bundle.alarm_rules);
  return asArray(rules?.rules)
    .map((r) => asRecord(r))
    .filter((r): r is Record<string, unknown> => r != null);
}

export function selectCausalEdges(bundle: StudioDraftBundle): Array<Record<string, unknown>> {
  const graph = asRecord(bundle.causal_graph);
  return asArray(graph?.edges)
    .map((e) => asRecord(e))
    .filter((e): e is Record<string, unknown> => e != null);
}

export function selectActions(bundle: StudioDraftBundle): Array<Record<string, unknown>> {
  const envelope = asRecord(bundle.action_envelope);
  return asArray(envelope?.actions)
    .map((a) => asRecord(a))
    .filter((a): a is Record<string, unknown> => a != null);
}

export function selectRoles(bundle: StudioDraftBundle): string[] {
  const plant = asRecord(bundle.plant);
  const roles = plant?.roles;
  if (!Array.isArray(roles)) return [];
  return roles.filter((r): r is string => typeof r === "string");
}

export function selectIssuesForTarget(
  state: Pick<StudioDraftState, "issues">,
  family: StudioDraftFamily,
  targetId: string,
): StudioDraftState["issues"] {
  return state.issues.filter((i) => i.family === family && i.targetId === targetId);
}

export function selectIssuesForFamily(
  state: Pick<StudioDraftState, "issues">,
  family: StudioDraftFamily,
): StudioDraftState["issues"] {
  return state.issues.filter((i) => i.family === family);
}

export function selectDirtyFamilies(state: Pick<StudioDraftState, "dirtyFamilies">): StudioDraftFamily[] {
  return (Object.entries(state.dirtyFamilies) as Array<[StudioDraftFamily, boolean]>)
    .filter(([, dirty]) => dirty)
    .map(([family]) => family);
}

export function selectAssetOptions(bundle: StudioDraftBundle): Array<{ id: string; label: string }> {
  return selectAssets(bundle).map((asset) => ({
    id: readString(asset, "id"),
    label: readString(asset, "display_name") || readString(asset, "id"),
  }));
}

export function selectTagOptions(bundle: StudioDraftBundle): Array<{ id: string; label: string }> {
  return selectTags(bundle).map((tag) => ({
    id: readString(tag, "tag"),
    label: readString(tag, "tag"),
  }));
}

export function surfaceToFamily(surface: string): StudioDraftFamily | null {
  switch (surface) {
    case "asset":
    case "role_view":
      return "plant";
    case "tag":
      return "tag_map";
    case "alarm_rule":
      return "alarm_rules";
    case "causal_edge":
      return "causal_graph";
    case "action":
      return "action_envelope";
    default:
      return null;
  }
}

export function entityIdFromRecord(family: StudioDraftFamily, record: Record<string, unknown>): string {
  switch (family) {
    case "plant":
      return readString(record, "id");
    case "tag_map":
      return readString(record, "tag");
    case "alarm_rules":
      return readString(record, "id");
    case "causal_graph":
      return readString(record, "id");
    case "action_envelope":
      return readString(record, "id");
    default:
      return "";
  }
}

export function entityLabelFromRecord(family: StudioDraftFamily, record: Record<string, unknown>): string {
  switch (family) {
    case "plant":
      return readString(record, "display_name") || readString(record, "id");
    case "tag_map":
      return readString(record, "tag");
    case "alarm_rules":
      return readString(record, "message") || readString(record, "id");
    case "causal_graph":
      return `${readString(record, "from")} → ${readString(record, "to")}`;
    case "action_envelope":
      return readString(record, "label") || readString(record, "id");
    default:
      return "";
  }
}

export function selectEntitiesForFamily(bundle: StudioDraftBundle, family: StudioDraftFamily) {
  switch (family) {
    case "plant":
      return selectAssets(bundle);
    case "tag_map":
      return selectTags(bundle);
    case "alarm_rules":
      return selectAlarmRules(bundle);
    case "causal_graph":
      return selectCausalEdges(bundle);
    case "action_envelope":
      return selectActions(bundle);
    default:
      return [];
  }
}

export function selectNodeOptions(bundle: StudioDraftBundle): Array<{ id: string; label: string }> {
  const graph = asRecord(bundle.causal_graph);
  return asArray(graph?.nodes)
    .map((n) => asRecord(n))
    .filter((n): n is Record<string, unknown> => n != null)
    .map((n) => ({
      id: readString(n, "id"),
      label: readString(n, "label") || readString(n, "id"),
    }));
}

export function selectAuthoredBundleInput(bundle: StudioDraftBundle): AuthoredBundleInput {
  const result: AuthoredBundleInput = {};
  const plant = asRecord(bundle.plant);
  const tagMap = asRecord(bundle.tag_map);
  const alarmRules = asRecord(bundle.alarm_rules);
  const causalGraph = asRecord(bundle.causal_graph);
  const actionEnvelope = asRecord(bundle.action_envelope);

  if (plant) {
    result.plant = {
      assets: selectAssets(bundle).map((a) => ({
        id: readString(a, "id"),
        type: readString(a, "type"),
        display_name: readString(a, "display_name"),
      })),
    };
  }
  if (tagMap) {
    result.tag_map = {
      tags: selectTags(bundle).map((t) => ({
        tag: readString(t, "tag"),
        asset_id: readString(t, "asset_id"),
      })),
    };
  }
  if (alarmRules) {
    result.alarm_rules = {
      rules: selectAlarmRules(bundle).map((r) => {
        const assetId = readString(r, "asset_id");
        const message = readString(r, "message");
        return {
          id: readString(r, "id"),
          tag: readString(r, "tag"),
          ...(assetId ? { asset_id: assetId } : {}),
          ...(message ? { message } : {}),
        };
      }),
    };
  }
  if (causalGraph) {
    result.causal_graph = {
      nodes: selectNodeOptions(bundle).map((n) => ({ id: n.id, label: n.label })),
      edges: selectCausalEdges(bundle).map((e) => ({
        id: readString(e, "id"),
        from: readString(e, "from"),
        to: readString(e, "to"),
      })),
    };
  }
  if (actionEnvelope) {
    result.action_envelope = {
      actions: selectActions(bundle).map((a) => {
        const targetAsset = readString(a, "target_asset_id");
        return {
          id: readString(a, "id"),
          label: readString(a, "label"),
          ...(targetAsset ? { target_asset_id: targetAsset } : {}),
        };
      }),
    };
  }
  return result;
}