import {
  buildCommandRegistryParams,
  executeOperationalCommand,
  type CommandRegistryParams,
} from "./commandRegistry";
import type { MapLayerId, UserRole } from "../operational-map";
import type {
  OperationalSearchActionContext,
  OperationalSearchResult,
} from "./searchTypes";

export interface ExecuteSearchResultParams {
  result: OperationalSearchResult;
  context: OperationalSearchActionContext;
  commandParams: CommandRegistryParams;
}

export function executeOperationalSearchResult({
  result,
  context,
  commandParams,
}: ExecuteSearchResultParams): void {
  const doc = result.document;

  switch (doc.kind) {
    case "asset":
    case "causal_step":
      if (doc.assetId) {
        context.selectAsset(doc.assetId);
        context.focusAsset(doc.assetId);
      }
      break;
    case "tag":
      if (doc.assetId) {
        context.selectAsset(doc.assetId);
        context.focusAsset(doc.assetId);
      }
      break;
    case "alarm":
      if (doc.assetId) {
        context.selectAsset(doc.assetId);
        context.focusAsset(doc.assetId);
      }
      context.openRawAlarms();
      break;
    case "command":
      executeOperationalCommand(doc, context, commandParams);
      break;
    default:
      break;
  }
}

export function buildExecuteCommandParams(input: {
  role: UserRole;
  mapMode: "2d" | "3d";
  showLegend: boolean;
  density: "comfortable" | "compact";
  rootAssetId: string | null;
  alarmCount: number;
  visibleLayers: Record<MapLayerId, boolean>;
}): CommandRegistryParams {
  return buildCommandRegistryParams(input);
}