/**
 * Single source of navigation + authorization for routes. The shell renders from this list and
 * RequireRole guards use the same roles, so menus and access never disagree.
 */
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlarmClock,
  Boxes,
  Cable,
  CheckSquare,
  GitBranch,
  History,
  LayoutDashboard,
  LibraryBig,
  Radar,
  ShieldCheck,
  Siren,
  Workflow,
} from "lucide-react";
import type { Role } from "./session";

export type Workspace = "operate" | "engineer" | "admin";

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  workspace: Workspace;
  roles: readonly Role[];
  description: string;
}

const ALL: readonly Role[] = ["viewer", "operator", "maintenance", "engineer", "admin"];
const ENG: readonly Role[] = ["engineer", "admin"];

export const WORKSPACE_LABEL: Record<Workspace, string> = {
  operate: "Operate",
  engineer: "Engineer",
  admin: "Administer",
};

export const NAV: readonly NavItem[] = [
  { path: "/ops", label: "Overview", icon: LayoutDashboard, workspace: "operate", roles: ALL,
    description: "Plant map, active situation and Calm Card" },
  { path: "/ops/alarms", label: "Alarms", icon: Siren, workspace: "operate", roles: ALL,
    description: "Active, shelved and grouped alarms" },
  { path: "/ops/trends", label: "Trends", icon: Activity, workspace: "operate", roles: ALL,
    description: "Live tag trends with alarm limits" },
  { path: "/ops/causal", label: "Causal graph", icon: GitBranch, workspace: "operate", roles: ALL,
    description: "Approved cause-and-effect structure and live root path" },
  { path: "/ops/3d", label: "3D plant", icon: Boxes, workspace: "operate", roles: ALL,
    description: "Equipment in 3D (enhancement; 2D stays canonical)" },
  { path: "/ops/incidents", label: "Incidents", icon: AlarmClock, workspace: "operate", roles: ALL,
    description: "Incident rooms and handover" },
  { path: "/ops/connections", label: "Connections", icon: Cable, workspace: "operate", roles: ALL,
    description: "Gateway PCs, serial ports and data flow from the hardware" },
  { path: "/eng/studio", label: "Plant Studio", icon: Workflow, workspace: "engineer", roles: ENG,
    description: "Assemble equipment and connections" },
  { path: "/eng/library", label: "Pattern library", icon: LibraryBig, workspace: "engineer", roles: ENG,
    description: "Failure patterns per component type" },
  { path: "/eng/coverage", label: "Coverage", icon: Radar, workspace: "engineer", roles: ENG,
    description: "Which failure modes are observable today" },
  { path: "/eng/approvals", label: "Approvals", icon: CheckSquare, workspace: "engineer", roles: ENG,
    description: "Review drafted changes before they reach the runtime" },
  { path: "/admin/revisions", label: "Revisions", icon: History, workspace: "admin", roles: ENG,
    description: "Deployed bundle history and rollback" },
  { path: "/admin/audit", label: "Audit ledger", icon: ShieldCheck, workspace: "admin", roles: ENG,
    description: "Hash-chained record of every decision" },
];

export function navFor(role: Role): NavItem[] {
  return NAV.filter((item) => item.roles.includes(role));
}

export function rolesForPath(path: string): readonly Role[] {
  const match = [...NAV].sort((a, b) => b.path.length - a.path.length).find((i) => path.startsWith(i.path));
  return match?.roles ?? ALL;
}
