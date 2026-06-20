import type { PlantHMIState } from "../../app/schemas/plantHmi";
import { overallStatusClass, overallStatusLabel } from "./statusStyles";

interface HmiStateStripProps {
  state: PlantHMIState;
}

export function HmiStateStrip({ state }: HmiStateStripProps) {
  const incident = state.active_incident;

  return (
    <header className="hmi-state-strip" aria-label="Plant HMI status">
      <div className="hmi-state-strip__plant">
        <span className="hmi-state-strip__title">{state.plant_id}</span>
        <span className="hmi-state-strip__run" data-tabular>
          {state.run_id}
        </span>
      </div>
      <div className={`hmi-state-strip__overall ${overallStatusClass(state.overall_status)}`}>
        {overallStatusLabel(state.overall_status)}
      </div>
      <div className="hmi-state-strip__meta">
        <span data-tabular>Generated {state.generated_at}</span>
        {incident ? (
          <span>
            Incident: {incident.title} ({Math.round(incident.confidence * 100)}%)
          </span>
        ) : (
          <span>No active incident</span>
        )}
      </div>
    </header>
  );
}