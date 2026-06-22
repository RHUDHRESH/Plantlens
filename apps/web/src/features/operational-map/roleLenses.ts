import type { RoleLens, UserRole } from "./mapKernelTypes";

export class UnknownUserRoleError extends Error {
  constructor(role: string) {
    super(`Unknown user role: ${role}`);
    this.name = "UnknownUserRoleError";
  }
}

export const ROLE_LENSES: Record<UserRole, RoleLens> = {
  operator: {
    role: "operator",
    label: "Operator",
    intent:
      "See the active Situation, root asset, first signal, best check, and raw alarm disclosure without configuration noise.",
    visibleLayerDefaults: {
      status: true,
      causal_path: true,
      raw_alarms: true,
      actions: true,
      geometry: true,
      tags: false,
      maintenance: false,
      audit: false,
    },
    detailBias: "area",
    showTagDetails: false,
    showAuditDetails: false,
    showMaintenanceDetails: false,
    showManagerSummary: false,
  },
  engineer: {
    role: "engineer",
    label: "Engineer",
    intent: "Inspect tags, causal paths, model references, validation clues, and audit context.",
    visibleLayerDefaults: {
      status: true,
      causal_path: true,
      raw_alarms: true,
      tags: true,
      actions: true,
      maintenance: true,
      audit: true,
      geometry: true,
    },
    detailBias: "component",
    showTagDetails: true,
    showAuditDetails: true,
    showMaintenanceDetails: true,
    showManagerSummary: false,
  },
  maintenance: {
    role: "maintenance",
    label: "Maintenance",
    intent: "Find affected equipment, sensor health, maintenance checks, and physical service context.",
    visibleLayerDefaults: {
      status: true,
      causal_path: true,
      raw_alarms: true,
      tags: true,
      actions: true,
      maintenance: true,
      geometry: true,
      audit: false,
    },
    detailBias: "asset",
    showTagDetails: true,
    showAuditDetails: false,
    showMaintenanceDetails: true,
    showManagerSummary: false,
  },
  manager: {
    role: "manager",
    label: "Manager",
    intent: "See plant health, incident summary, business impact, and audit receipts without tag spam.",
    visibleLayerDefaults: {
      status: true,
      causal_path: true,
      audit: true,
      geometry: true,
      raw_alarms: false,
      tags: false,
      actions: false,
      maintenance: false,
    },
    detailBias: "plant",
    showTagDetails: false,
    showAuditDetails: true,
    showMaintenanceDetails: false,
    showManagerSummary: true,
  },
};

export function getRoleLens(role: UserRole): RoleLens {
  const lens = ROLE_LENSES[role];
  if (!lens) throw new UnknownUserRoleError(role);
  return lens;
}

export function getRoleLabel(role: UserRole): string {
  return getRoleLens(role).label;
}