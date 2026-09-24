import type { OperatorAction } from "../../app/schemas/plantHmi";
import { Panel, StatusBadge } from "../../components/ui/primitives";
import { formatSafetyLevel, safetyKind, statusLabel } from "./statusStyles";

interface OperatorActionsProps {
  actions: OperatorAction[];
}

export function OperatorActions({ actions }: OperatorActionsProps) {
  return (
    <Panel title="Recommended actions" aria-label="Operator actions" className="hmi-card">
      <p className="hmi-meta hmi-operator-actions__disclaimer">
        PlantLens actions are advisory. Use approved plant procedures and local controls.
      </p>
      {actions.length === 0 ? (
        <p className="hmi-muted">No operator actions supplied.</p>
      ) : (
        <ul className="hmi-list">
          {actions.map((action) => (
            <li key={`${action.priority}-${action.title}`} className="hmi-item">
              <div className="hmi-item__head">
                <span className="hmi-operator-actions__title">
                  <span className="hmi-operator-actions__priority" data-tabular>
                    #{action.priority}
                  </span>
                  <strong>{action.title}</strong>
                </span>
                <StatusBadge
                  compact
                  status={safetyKind(action.safety_level)}
                  label={statusLabel(formatSafetyLevel(action.safety_level))}
                />
              </div>
              <p className="hmi-item__body">{action.instruction}</p>
              {action.target_asset_id && (
                <p className="hmi-meta">
                  Target <span className="pl-mono">{action.target_asset_id}</span>
                </p>
              )}
              <p className="hmi-meta">{action.rationale}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
