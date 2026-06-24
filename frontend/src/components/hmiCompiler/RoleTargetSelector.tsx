import { useStore } from "../../store/useStore";
import type { HmiRoleTarget } from "./hmiCompilerTypes";

const ROLES: { id: HmiRoleTarget; label: string }[] = [
  { id: "operator", label: "Operator" },
  { id: "maintenance", label: "Maintenance" },
  { id: "supervisor", label: "Supervisor" },
  { id: "engineer", label: "Engineer" },
];

export function RoleTargetSelector() {
  const { hmiRoleTarget, setHmiRoleTarget } = useStore();

  return (
    <fieldset className="pl-hmi-selector">
      <legend className="pl-hmi-selector__legend">Role target</legend>
      <div className="pl-hmi-selector__options" role="radiogroup" aria-label="HMI role target">
        {ROLES.map((role) => (
          <button
            key={role.id}
            type="button"
            role="radio"
            aria-checked={hmiRoleTarget === role.id}
            className={[
              "pl-hmi-selector__option",
              hmiRoleTarget === role.id ? "pl-hmi-selector__option--active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => setHmiRoleTarget(role.id)}
          >
            <span className="pl-hmi-selector__marker" aria-hidden="true">
              {hmiRoleTarget === role.id ? "●" : "○"}
            </span>
            {role.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}