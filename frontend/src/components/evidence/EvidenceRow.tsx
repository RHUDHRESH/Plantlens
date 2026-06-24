import type { EvidenceItem, EvidenceKind } from "../../types/evidence";

const MARKERS: Record<EvidenceKind, string> = {
  supporting: "+",
  missing: "?",
  contradicting: "!",
  neutral: "·",
};

interface EvidenceRowProps {
  item: EvidenceItem;
  variant?: "table" | "card";
}

export function evidenceMarker(kind: EvidenceKind): string {
  return MARKERS[kind];
}

export function EvidenceRow({ item, variant = "card" }: EvidenceRowProps) {
  const marker = evidenceMarker(item.kind);

  if (variant === "table") {
    return (
      <tr className={`pl-evidence-table__row pl-evidence-table__row--${item.kind}`}>
        <td>
          <span className="pl-evidence-row__marker" aria-hidden="true">
            {marker}
          </span>
          {item.signal}
        </td>
        <td>{item.expected}</td>
        <td>{item.observed}</td>
        <td>{item.match}</td>
        <td>{item.weight !== null ? `+${item.weight.toFixed(2)}` : "?"}</td>
        <td>{item.quality}</td>
        <td className="pl-evidence-table__note">{item.note}</td>
      </tr>
    );
  }

  return (
    <div className={`pl-evidence-row pl-evidence-row--${item.kind}`}>
      <span className="pl-evidence-row__marker" aria-label={`${item.kind} evidence`}>
        {marker}
      </span>
      <div className="pl-evidence-row__body">
        <span className="pl-evidence-row__signal">{item.signal}</span>
        <span className="pl-evidence-row__observed">{item.observed}</span>
        {item.note && <span className="pl-evidence-row__note">{item.note}</span>}
      </div>
    </div>
  );
}