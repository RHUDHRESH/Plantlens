/**
 * RoleView (Domain N) — same plant state, different surface per role.
 * operator / maintenance / supervisor / engineer. Identity for view selection +
 * audit attribution ONLY; never unlocks write capability (there is none).
 */
import { useStore } from "../store/useStore";
import type { Role } from "../design/types";
import { SegmentedControl } from "./ui/SegmentedControl";
import { Panel } from "./ui/Panel";

const ROLES: Role[] = ["operator", "maintenance", "supervisor", "engineer"];

const ROLE_LABELS: Record<Role, string> = {
  operator: "Operator",
  maintenance: "Maintenance",
  supervisor: "Supervisor",
  engineer: "Engineer",
};

export function RoleView() {
  const role = useStore((s) => s.role);
  const setRole = useStore((s) => s.setRole);

  return (
    <Panel title="Active role" subtitle="View selection & audit attribution only">
      <SegmentedControl
        options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
        value={role}
        onChange={setRole}
        ariaLabel="Select role view"
      />
      <p className="pl-role-view__hint">
        Role changes UI surfaces only. PlantLens is read-only — no write capability.
      </p>
    </Panel>
  );
}