import type { EvidenceItem } from "../../app/schemas/plantHmi";
import { Panel, StatusBadge } from "../../components/ui/primitives";
import { signalStatusKind, statusLabel } from "./statusStyles";

interface EvidenceListProps {
  evidence: EvidenceItem[];
}

export function EvidenceList({ evidence }: EvidenceListProps) {
  return (
    <Panel title="Evidence" aria-label="Evidence" className="hmi-card">
      {evidence.length === 0 ? (
        <p className="hmi-muted">No evidence items supplied.</p>
      ) : (
        <ul className="hmi-list">
          {evidence.map((item) => (
            <li key={item.evidence_id} className="hmi-item">
              <div className="hmi-item__head">
                <strong className="pl-mono">{item.signal_id}</strong>
                <StatusBadge compact status={signalStatusKind(item.status)} label={statusLabel(item.status)} />
              </div>
              <p className="hmi-item__body">{item.description}</p>
              <p className="hmi-meta" data-tabular>
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
      )}
    </Panel>
  );
}
