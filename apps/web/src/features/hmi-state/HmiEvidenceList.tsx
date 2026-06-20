import type { PlantHMIState } from "../../app/schemas/plantHmi";
import type { EvidenceItem } from "../../app/schemas/plantHmi";
import { formatValue, getActiveCausalityEdges } from "./hmiFormatting";

interface HmiEvidenceListProps {
  state: PlantHMIState;
}

function EvidenceRow({ item }: { item: EvidenceItem }) {
  return (
    <li className="hmi-evidence-list__row">
      <strong>{item.signal_id}</strong> — {item.description}
      <span className="hmi-evidence-list__muted">
        {" "}
        · {item.asset_id} · {item.status} · weight {item.weight}
        {item.observed_value !== null && item.observed_value !== undefined && (
          <> · {formatValue(item.observed_value, item.unit)}</>
        )}
        {item.timestamp ? <> · {item.timestamp}</> : null}
      </span>
    </li>
  );
}

export function HmiEvidenceList({ state }: HmiEvidenceListProps) {
  const incident = state.active_incident;
  const topCandidate = state.root_cause_candidates[0] ?? null;
  const activeEdges = getActiveCausalityEdges(state);
  const hasContent =
    Boolean(incident?.evidence.length) ||
    Boolean(topCandidate?.evidence.length) ||
    Boolean(incident?.primary_alarms.length) ||
    Boolean(incident?.secondary_symptoms.length) ||
    Boolean(state.suppressed_symptoms.length) ||
    Boolean(state.alarm_groups.length) ||
    activeEdges.length > 0;

  if (!hasContent) {
    return (
      <section className="hmi-evidence-list hmi-evidence-list--empty" aria-label="Evidence">
        <h3>Evidence</h3>
        <p>No evidence items supplied.</p>
      </section>
    );
  }

  return (
    <section className="hmi-evidence-list" aria-label="Evidence">
      <h3>Evidence</h3>

      {incident && incident.primary_alarms.length > 0 && (
        <div className="hmi-evidence-list__section">
          <h4>Primary alarms</h4>
          <ul>
            {incident.primary_alarms.map((alarm) => (
              <li key={alarm}>{alarm}</li>
            ))}
          </ul>
        </div>
      )}

      {incident && incident.secondary_symptoms.length > 0 && (
        <div className="hmi-evidence-list__section">
          <h4>Secondary symptoms</h4>
          <ul>
            {incident.secondary_symptoms.map((symptom) => (
              <li key={symptom}>{symptom}</li>
            ))}
          </ul>
        </div>
      )}

      {state.suppressed_symptoms.length > 0 && (
        <div className="hmi-evidence-list__section hmi-evidence-list__section--muted">
          <h4>Suppressed symptoms</h4>
          <ul className="hmi-evidence-list__muted">
            {state.suppressed_symptoms.map((symptom) => (
              <li key={symptom}>{symptom}</li>
            ))}
          </ul>
        </div>
      )}

      {state.alarm_groups.length > 0 && (
        <div className="hmi-evidence-list__section">
          <h4>Alarm groups</h4>
          <ul>
            {state.alarm_groups.map((group) => (
              <li key={group.group_id}>
                {group.title} ({group.severity}) — {group.grouped_alarms.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {incident && incident.evidence.length > 0 && (
        <div className="hmi-evidence-list__section">
          <h4>Incident evidence</h4>
          <ul>
            {incident.evidence.map((item) => (
              <EvidenceRow key={item.evidence_id} item={item} />
            ))}
          </ul>
        </div>
      )}

      {topCandidate && topCandidate.evidence.length > 0 && (
        <div className="hmi-evidence-list__section">
          <h4>Root cause candidate evidence</h4>
          <ul>
            {topCandidate.evidence.map((item) => (
              <EvidenceRow key={item.evidence_id} item={item} />
            ))}
          </ul>
        </div>
      )}

      {activeEdges.length > 0 && (
        <div className="hmi-evidence-list__section">
          <h4>Active causality</h4>
          <ul>
            {activeEdges.map((edge) => (
              <li key={edge.edge_id} className="hmi-causality-edge hmi-causality-edge--active">
                {edge.from_asset_id} → {edge.to_asset_id}
                <span className="hmi-evidence-list__muted"> ({edge.relation})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}