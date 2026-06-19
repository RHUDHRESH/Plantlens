import type { CalmCardEvidenceItem } from "../../app/schemas/calmCard";

interface EvidenceChainProps {
  items: CalmCardEvidenceItem[];
  onHighlightAsset?: (assetId: string) => void;
}

export function EvidenceChain({ items, onHighlightAsset }: EvidenceChainProps) {
  if (!items.length) return null;

  return (
    <section className="calm-card__evidence" aria-label="Evidence chain">
      <h3>Evidence chain</h3>
      <ol className="calm-card__evidence-list">
        {items.map((item) => (
          <li key={`${item.order}-${item.alarm_id}`} className="evidence-step">
            <span className="evidence-step__order data-number">{item.order}</span>
            <div className="evidence-step__body">
              <button
                type="button"
                className="calm-card__evidence-link"
                onClick={() => onHighlightAsset?.(item.asset_id)}
                aria-label={`Highlight ${item.asset_id} on map`}
              >
                {item.message}
              </button>
              <span className="calm-card__asset data-number">{item.asset_id}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}