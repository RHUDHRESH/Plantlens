/**
 * Role-gated advisory actions (GET /api/runtime/actions) → what the Calm Card shows. PlantLens is
 * advisory: an action is only ever a *recommended check*; nothing here can execute anything.
 * Permitted checks come first (in envelope order), blocked ones after, each with the reason.
 */
import type { RuntimeAction } from "../../api/v2";

export interface ActionItem {
  id: string;
  label: string;
  permitted: boolean;
  /** Plain-language reason a blocked action is not for this viewer right now. */
  reason: string | null;
  risk: string | null;
  notes: string[];
}

const ROLE_NAME: Record<string, string> = {
  viewer: "Viewer",
  operator: "Operator",
  maintenance: "Maintenance",
  engineer: "Engineer",
  admin: "Administrator",
};

const roleName = (r: string) => ROLE_NAME[r] ?? r;

function list(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

function blockedReason(action: RuntimeAction, role: string): string {
  if (action.allowed_roles.length && !action.allowed_roles.includes(role)) {
    return `Not for the ${roleName(role)} role. ${list(action.allowed_roles.map(roleName))} can carry this out.`;
  }
  if (action.blocking_alarms.length) {
    return action.reason ?? `Blocked while ${list(action.blocking_alarms)} ${action.blocking_alarms.length === 1 ? "is" : "are"} active.`;
  }
  return action.reason ?? "Blocked by the site action envelope.";
}

function notesFor(action: RuntimeAction): string[] {
  const notes: string[] = [];
  if (action.requires_isolation) notes.push("Isolate before touching");
  if (action.requires_operator_confirm) notes.push("Needs operator confirmation on site");
  if (action.plc_permission_required) notes.push("Done from the plant's own controls, not PlantLens");
  if (action.safety_note) notes.push(action.safety_note);
  return notes;
}

export function orderActions(actions: readonly RuntimeAction[] | null | undefined, role: string): ActionItem[] {
  const items = (actions ?? []).map((a, index) => ({
    index,
    item: {
      id: a.action_id,
      label: a.label,
      permitted: a.allowed,
      reason: a.allowed ? null : blockedReason(a, role),
      risk: a.risk_level ?? null,
      notes: notesFor(a),
    } satisfies ActionItem,
  }));
  return items
    .sort((x, y) => Number(y.item.permitted) - Number(x.item.permitted) || x.index - y.index)
    .map((x) => x.item);
}
