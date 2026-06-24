import type { ContradictionItem } from "../../types/evidence";
import { Panel } from "../ui/Panel";
import { Badge } from "../ui/Badge";

interface ContradictionPanelProps {
  items: ContradictionItem[];
}

export function ContradictionPanel({ items }: ContradictionPanelProps) {
  return (
    <Panel title="Contradictions" className="pl-contradiction-panel">
      {items.length === 0 ? (
        <p className="pl-contradiction-panel__none">No strong contradiction found.</p>
      ) : (
        <ul className="pl-contradiction-panel__list" role="list">
          {items.map((item) => (
            <li key={item.id} className="pl-contradiction-panel__item">
              <span className="pl-evidence-row__marker" aria-hidden="true">
                !
              </span>
              <div>
                <strong>{item.signal}</strong>
                <p>{item.note}</p>
                <Badge variant={item.vetoes ? "critical" : "normal"}>
                  {item.vetoes ? "Vetoes diagnosis" : "Does not veto"}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}