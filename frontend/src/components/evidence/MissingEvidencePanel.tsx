import type { MissingEvidenceItem } from "../../types/evidence";
import { Panel } from "../ui/Panel";

interface MissingEvidencePanelProps {
  items: MissingEvidenceItem[];
}

export function MissingEvidencePanel({ items }: MissingEvidencePanelProps) {
  return (
    <Panel variant="light" title="What we still do not know" className="pl-missing-evidence">
      {items.length === 0 ? (
        <p className="pl-missing-evidence__empty">No missing evidence flagged.</p>
      ) : (
        <ul className="pl-missing-evidence__list" role="list">
          {items.map((item) => (
            <li key={item.id} className="pl-missing-evidence__item">
              <span className="pl-evidence-row__marker" aria-hidden="true">
                ?
              </span>
              <div>
                <strong>{item.signal}</strong>
                <p>{item.why}</p>
                <p className="pl-missing-evidence__rec">{item.recommendation}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}