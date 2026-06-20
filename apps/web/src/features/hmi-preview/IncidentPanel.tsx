import type { IncidentHMIState } from "../../app/schemas/plantHmi";

interface IncidentPanelProps {
  incident: IncidentHMIState | null;
}

export function IncidentPanel({ incident }: IncidentPanelProps) {
  if (!incident) {
    return (
      <section className="hmi-incident hmi-incident--empty" aria-label="Active incident">
        <h2>Active incident</h2>
        <p>No active incident. Backend reported no grouped situation.</p>
      </section>
    );
  }

  return (
    <section className="hmi-incident" aria-label="Active incident">
      <h2>{incident.title}</h2>
      <p className="hmi-incident__summary">{incident.summary}</p>
      <dl className="hmi-incident__facts">
        <div>
          <dt>Severity</dt>
          <dd>{incident.severity}</dd>
        </div>
        <div>
          <dt>Suspected root cause</dt>
          <dd>{incident.suspected_root_cause}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd data-tabular>{(incident.confidence * 100).toFixed(0)}%</dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd data-tabular>{incident.started_at}</dd>
        </div>
        <div>
          <dt>Affected assets</dt>
          <dd>{incident.affected_assets.join(", ") || "—"}</dd>
        </div>
      </dl>
    </section>
  );
}