import type { OperatorAction } from "../../app/schemas/plantHmi";
import { formatSafetyLevel } from "./statusStyles";

interface OperatorActionsProps {
  actions: OperatorAction[];
}

export function OperatorActions({ actions }: OperatorActionsProps) {
  return (
    <section className="hmi-operator-actions" aria-label="Operator actions">
      <header className="hmi-operator-actions__header">
        <h2>Recommended actions</h2>
        <p className="hmi-operator-actions__disclaimer">
          PlantLens actions are advisory. Use approved plant procedures and local controls.
        </p>
      </header>
      {actions.length === 0 ? (
        <p className="hmi-operator-actions__empty">No operator actions supplied.</p>
      ) : (
        <ul className="hmi-operator-actions__list">
          {actions.map((action) => (
            <li key={`${action.priority}-${action.title}`} className="hmi-operator-actions__card">
              <div className="hmi-operator-actions__card-head">
                <span className="hmi-operator-actions__priority" data-tabular>
                  #{action.priority}
                </span>
                <strong>{action.title}</strong>
                <span className="hmi-operator-actions__safety">
                  {formatSafetyLevel(action.safety_level)}
                </span>
              </div>
              <p>{action.instruction}</p>
              {action.target_asset_id && (
                <p className="hmi-operator-actions__target">Target: {action.target_asset_id}</p>
              )}
              <p className="hmi-operator-actions__rationale">{action.rationale}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}