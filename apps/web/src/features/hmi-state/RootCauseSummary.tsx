import type { PlantHMIState } from "../../app/schemas/plantHmi";
import { formatConfidence, formatOverallStatus } from "./hmiFormatting";

interface RootCauseSummaryProps {
  state: PlantHMIState;
}

export function RootCauseSummary({ state }: RootCauseSummaryProps) {
  const incident = state.active_incident;
  const topCandidate = state.root_cause_candidates[0] ?? null;

  if (!incident) {
    return (
      <section className="root-cause-summary root-cause-summary--calm" aria-label="Plant status">
        <h2>All clear</h2>
        <p className="root-cause-summary__status">
          Overall: <strong>{formatOverallStatus(state.overall_status)}</strong>
        </p>
        <p className="root-cause-summary__empty">No active incident in HMI projection.</p>
      </section>
    );
  }

  return (
    <section className="root-cause-summary" aria-label="Root cause summary">
      <header className="root-cause-summary__header">
        <h2 className="root-cause-summary__title">{incident.title}</h2>
        <p className="root-cause-summary__status">
          Overall: <strong>{formatOverallStatus(state.overall_status)}</strong>
        </p>
      </header>
      <dl className="root-cause-summary__meta">
        <div>
          <dt>Suspected root cause</dt>
          <dd>{incident.suspected_root_cause}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd className="root-cause-summary__confidence data-number">
            {formatConfidence(incident.confidence)}
          </dd>
        </div>
        <div>
          <dt>Severity</dt>
          <dd>{incident.severity}</dd>
        </div>
        <div>
          <dt>Affected assets</dt>
          <dd>{incident.affected_assets.join(", ") || "—"}</dd>
        </div>
        {topCandidate && (
          <div>
            <dt>Top candidate</dt>
            <dd>
              {topCandidate.title} ({topCandidate.asset_id}) —{" "}
              <span className="data-number">{formatConfidence(topCandidate.confidence)}</span>
            </dd>
          </div>
        )}
        {topCandidate && topCandidate.rejected_alternatives.length > 0 && (
          <div>
            <dt>Rejected alternatives</dt>
            <dd>{topCandidate.rejected_alternatives.join(", ")}</dd>
          </div>
        )}
      </dl>
      {incident.summary && <p className="root-cause-summary__summary">{incident.summary}</p>}
    </section>
  );
}