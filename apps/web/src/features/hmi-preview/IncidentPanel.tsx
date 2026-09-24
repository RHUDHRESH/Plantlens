import type { IncidentHMIState } from "../../app/schemas/plantHmi";
import { Panel, StatusBadge } from "../../components/ui/primitives";
import { severityKind, statusLabel } from "./statusStyles";

interface IncidentPanelProps {
  incident: IncidentHMIState | null;
}

export function IncidentPanel({ incident }: IncidentPanelProps) {
  if (!incident) {
    return (
      <Panel title="Active incident" aria-label="Active incident" className="hmi-card">
        <p className="hmi-muted">No active incident. Backend reported no grouped situation.</p>
      </Panel>
    );
  }

  return (
    <Panel
      title={incident.title}
      aria-label="Active incident"
      className="hmi-card"
      actions={<StatusBadge compact status={severityKind(incident.severity)} label={statusLabel(incident.severity)} />}
    >
      <p className="hmi-item__body">{incident.summary}</p>
      <dl className="hmi-facts">
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
    </Panel>
  );
}
