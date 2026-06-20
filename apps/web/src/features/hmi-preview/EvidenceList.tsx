import type { EvidenceItem } from "../../app/schemas/plantHmi";
import { signalStatusClass } from "./statusStyles";

interface EvidenceListProps {
  evidence: EvidenceItem[];
}

export function EvidenceList({ evidence }: EvidenceListProps) {
  if (evidence.length === 0) {
    return (
      <section className="hmi-evidence hmi-evidence--empty" aria-label="Evidence">
        <h2>Evidence</h2>
        <p>No evidence items supplied.</p>
      </section>
    );
  }

  return (
    <section className="hmi-evidence" aria-label="Evidence">
      <h2>Evidence</h2>
      <ul className="hmi-evidence__list">
        {evidence.map((item) => (
          <li key={item.evidence_id} className="hmi-evidence__item">
            <div className="hmi-evidence__header">
              <strong>{item.signal_id}</strong>
              <span className={signalStatusClass(item.status)}>{item.status}</span>
            </div>
            <p>{item.description}</p>
            <p className="hmi-evidence__meta" data-tabular>
              {item.asset_id}
              {item.observed_value !== null && item.observed_value !== undefined && (
                <>
                  {" "}
                  · {String(item.observed_value)}
                  {item.unit ? ` ${item.unit}` : ""}
                </>
              )}
              {item.timestamp ? ` · ${item.timestamp}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}