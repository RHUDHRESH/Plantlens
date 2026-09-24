import type { PlantHMIState } from "../../app/schemas/plantHmi";
import { StatusBadge } from "../../components/ui/primitives";
import { overallStatusKind, overallStatusLabel } from "./statusStyles";

interface HmiStateStripProps {
  state: PlantHMIState;
}

export function HmiStateStrip({ state }: HmiStateStripProps) {
  const incident = state.active_incident;

  return (
    <header className="hmi-state-strip" aria-label="Plant HMI status">
      <div className="hmi-state-strip__plant">
        <span className="hmi-state-strip__title">{state.plant_id}</span>
        <span className="hmi-meta" data-tabular>
          {state.run_id}
        </span>
      </div>
      <StatusBadge status={overallStatusKind(state.overall_status)} label={overallStatusLabel(state.overall_status)} />
      <div className="hmi-state-strip__meta">
        <span>
          Generated <span data-tabular>{state.generated_at}</span>
        </span>
        {incident ? (
          <span>
            Incident: {incident.title} (<span data-tabular>{Math.round(incident.confidence * 100)}%</span>)
          </span>
        ) : (
          <span>No active incident</span>
        )}
      </div>
    </header>
  );
}
