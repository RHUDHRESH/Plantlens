import type { EvidenceItem } from "../../types/evidence";
import { EvidenceRow } from "./EvidenceRow";

interface EvidenceTableProps {
  items: EvidenceItem[];
}

export function EvidenceTable({ items }: EvidenceTableProps) {
  if (items.length === 0) {
    return <p className="pl-evidence-empty">No evidence items available.</p>;
  }

  return (
    <div className="pl-evidence-table-wrap">
      <table className="pl-evidence-table" aria-label="Situation evidence">
        <thead>
          <tr>
            <th scope="col">Signal</th>
            <th scope="col">Expected</th>
            <th scope="col">Observed</th>
            <th scope="col">Match</th>
            <th scope="col">Weight</th>
            <th scope="col">Quality</th>
            <th scope="col">Note</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <EvidenceRow key={item.id} item={item} variant="table" />
          ))}
        </tbody>
      </table>
    </div>
  );
}