import type { MapLayerId, UserRole } from "../operational-map";
import { buildDocumentTokens } from "./tokenizer";
import type {
  OperationalCommandId,
  OperationalSearchActionContext,
  OperationalSearchDocument,
} from "./searchTypes";

export interface CommandRegistryParams {
  role: UserRole;
  mapMode: "2d" | "3d";
  showLegend: boolean;
  density: "comfortable" | "compact";
  rootAssetId: string | null;
  hasRawAlarms: boolean;
}

interface CommandDef {
  id: OperationalCommandId;
  title: string;
  subtitle: string;
  boost: number;
  available: (params: CommandRegistryParams) => boolean;
  unavailableSubtitle?: string;
}

const COMMANDS: CommandDef[] = [
  {
    id: "fit_plant",
    title: "Fit plant",
    subtitle: "Fit map viewport to plant bounds",
    boost: 5,
    available: () => true,
  },
  {
    id: "focus_root",
    title: "Focus root",
    subtitle: "Focus map on root cause asset",
    boost: 10,
    available: (p) => Boolean(p.rootAssetId),
    unavailableSubtitle: "No root asset available",
  },
  {
    id: "open_raw_alarms",
    title: "Open raw alarms",
    subtitle: "Expand raw alarm table",
    boost: 8,
    available: (p) => p.hasRawAlarms,
    unavailableSubtitle: "No active alarms",
  },
  {
    id: "switch_2d",
    title: "Switch to 2D",
    subtitle: "Show 2D operational map",
    boost: 3,
    available: (p) => p.mapMode !== "2d",
  },
  {
    id: "switch_3d",
    title: "Switch to 3D",
    subtitle: "Show 3D operational map",
    boost: 3,
    available: (p) => p.mapMode !== "3d",
  },
  {
    id: "role_operator",
    title: "Operator role",
    subtitle: "Switch role lens to operator",
    boost: 2,
    available: (p) => p.role !== "operator",
  },
  {
    id: "role_engineer",
    title: "Engineer role",
    subtitle: "Switch role lens to engineer",
    boost: 2,
    available: (p) => p.role !== "engineer",
  },
  {
    id: "role_maintenance",
    title: "Maintenance role",
    subtitle: "Switch role lens to maintenance",
    boost: 2,
    available: (p) => p.role !== "maintenance",
  },
  {
    id: "role_manager",
    title: "Manager role",
    subtitle: "Switch role lens to manager",
    boost: 2,
    available: (p) => p.role !== "manager",
  },
  {
    id: "toggle_legend",
    title: "Toggle legend",
    subtitle: "Show or hide map legend",
    boost: 2,
    available: () => true,
  },
  {
    id: "toggle_compact_density",
    title: "Toggle compact density",
    subtitle: "Switch comfortable/compact layout",
    boost: 2,
    available: () => true,
  },
  {
    id: "open_studio",
    title: "Open Studio",
    subtitle: "Open authored model Studio",
    boost: 6,
    available: (p) => p.role === "engineer" || p.role === "maintenance",
  },
];

export function getOperationalCommandDocuments(params: CommandRegistryParams): OperationalSearchDocument[] {
  return COMMANDS.map((cmd) => {
    const available = cmd.available(params);
    const subtitle = available ? cmd.subtitle : (cmd.unavailableSubtitle ?? cmd.subtitle);
    const tokens = buildDocumentTokens(cmd.title, cmd.subtitle, cmd.id.replace(/_/g, " "));
    return {
      id: `command:${cmd.id}`,
      kind: "command" as const,
      title: cmd.title,
      subtitle,
      commandId: cmd.id,
      tokens,
      aliases: [],
      boost: available ? cmd.boost : 0,
    };
  });
}

export function executeOperationalCommand(
  document: OperationalSearchDocument,
  context: OperationalSearchActionContext,
  params?: CommandRegistryParams,
): void {
  if (document.kind !== "command" || !document.commandId) return;

  const cmdId = document.commandId;
  const needsRoot = cmdId === "focus_root";
  if (needsRoot && params && !params.rootAssetId) return;

  switch (cmdId) {
    case "fit_plant":
      context.fitPlant();
      break;
    case "focus_root":
      context.focusRoot();
      break;
    case "open_raw_alarms":
      context.openRawAlarms();
      break;
    case "switch_2d":
      context.setMapMode("2d");
      break;
    case "switch_3d":
      context.setMapMode("3d");
      break;
    case "role_operator":
      context.setRole("operator");
      break;
    case "role_engineer":
      context.setRole("engineer");
      break;
    case "role_maintenance":
      context.setRole("maintenance");
      break;
    case "role_manager":
      context.setRole("manager");
      break;
    case "toggle_legend":
      context.toggleLegend();
      break;
    case "toggle_compact_density":
      context.toggleCompactDensity();
      break;
    case "open_studio":
      context.openStudioOverview?.();
      break;
    default:
      break;
  }
}

export function buildCommandRegistryParams(input: {
  role: UserRole;
  mapMode: "2d" | "3d";
  showLegend: boolean;
  density: "comfortable" | "compact";
  rootAssetId: string | null;
  alarmCount: number;
  visibleLayers: Record<MapLayerId, boolean>;
}): CommandRegistryParams {
  return {
    role: input.role,
    mapMode: input.mapMode,
    showLegend: input.showLegend,
    density: input.density,
    rootAssetId: input.rootAssetId,
    hasRawAlarms: input.alarmCount > 0 && (input.visibleLayers.raw_alarms ?? true),
  };
}