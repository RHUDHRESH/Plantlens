import type { PlantHMIState } from "../../app/schemas/plantHmi";
import { getSafetyClassName, getSafetyLabel } from "./hmiFormatting";

interface OperatorActionsPanelProps {
  state: PlantHMIState;
}

export function OperatorActionsPanel({ state }: OperatorActionsPanelProps) {
  const actions = [...state.operator_actions].sort((a, b) => a.priority - b.priority);

  return (
    <section className="operator-actions" aria-label="Operator actions">
      <header className="hmi-state-panel__section-header">
        <h3>Operator actions</h3>
        <p className="operator-actions__disclaimer">Advisory only — follow approved plant procedures.</p>
      </header>
      {actions.length === 0 ? (
        <p className="operator-actions__empty">No operator actions supplied.</p>
      ) : (
        <ul className="operator-actions__list">
          {actions.map((action) => (
            <li
              key={`${action.priority}-${action.title}`}
              className={`operator-action ${getSafetyClassName(action.safety_level)}`}
            >
              <div className="operator-action__header">
                <span className="operator-action__priority data-number">#{action.priority}</span>
                <strong>{action.title}</strong>
                <span className="operator-action__safety">{getSafetyLabel(action.safety_level)}</span>
              </div>
              <p className="operator-action__instruction">{action.instruction}</p>
              {action.target_asset_id && (
                <p className="operator-action__target">Target asset: {action.target_asset_id}</p>
              )}
              <p className="operator-action__rationale">{action.rationale}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}