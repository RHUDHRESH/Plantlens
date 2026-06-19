import { useState } from "react";
import type { CalmCard as CalmCardType } from "../../app/schemas/calmCard";
import { BlockedActions } from "./BlockedActions";
import { EvidenceChain } from "./EvidenceChain";
import { FirstSignal } from "./FirstSignal";
import { RawAlarmDisclosure } from "./RawAlarmDisclosure";
import { RecommendedAction } from "./RecommendedAction";
import { TimeToConsequenceRing } from "./TimeToConsequenceRing";

interface CalmCardProps {
  card: CalmCardType;
  onViewRawAlarms?: () => void;
  onEscalate?: () => void;
  onHighlightAsset?: (assetId: string) => void;
  onFocusRoot?: () => void;
  escalating?: boolean;
}

export function CalmCard({
  card,
  onViewRawAlarms,
  onEscalate,
  onHighlightAsset,
  onFocusRoot,
  escalating,
}: CalmCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const severityClass =
    card.severity === "critical"
      ? "calm-card--critical"
      : card.severity === "warning"
        ? "calm-card--warning"
        : "";

  return (
    <article className={`calm-card ${severityClass}`} aria-labelledby="calm-card-title">
      <header className="calm-card__header">
        <h2 id="calm-card-title">{card.title}</h2>
        <div className="calm-card__root-row">
          <p className="calm-card__root">
            Root: <strong>{card.root_asset_name ?? card.root_asset_id}</strong>
          </p>
          {onFocusRoot && (
            <button type="button" className="pl-btn pl-btn--ghost pl-btn--compact" onClick={onFocusRoot}>
              Focus root
            </button>
          )}
        </div>
        {card.confidence && (
          <span className="calm-card__confidence data-number">Confidence: {card.confidence}</span>
        )}
      </header>

      {card.first_signal && <FirstSignal signal={card.first_signal} />}

      {card.why_it_matters && (
        <section className="calm-card__why">
          <h3>Why it matters</h3>
          <p>{card.why_it_matters}</p>
        </section>
      )}

      <RecommendedAction check={card.recommended_first_check} />

      <button
        type="button"
        className="calm-card__details-toggle"
        aria-expanded={detailsOpen}
        onClick={() => setDetailsOpen((v) => !v)}
      >
        {detailsOpen ? "Hide" : "Show"} evidence & details
      </button>

      {detailsOpen && (
        <div className="calm-card__details">
          <EvidenceChain
            items={card.evidence_chain}
            {...(onHighlightAsset ? { onHighlightAsset } : {})}
          />
          {card.time_to_consequence && <TimeToConsequenceRing ttc={card.time_to_consequence} />}
          {card.blocked_actions && <BlockedActions actions={card.blocked_actions} />}
        </div>
      )}

      <footer className="calm-card__footer">
        <RawAlarmDisclosure
          count={card.raw_alarm_count}
          {...(onViewRawAlarms ? { onView: onViewRawAlarms } : {})}
        />
        <p className="calm-card__authority">{card.operator_authority}</p>
        <button
          type="button"
          className="pl-btn pl-btn--primary"
          onClick={onEscalate}
          disabled={!onEscalate || escalating}
        >
          {escalating ? "Opening incident…" : "Escalate to Incident Room"}
        </button>
      </footer>
    </article>
  );
}

export function NoActiveSituation() {
  return (
    <div className="calm-card calm-card--empty" role="status">
      <h2>All clear</h2>
      <p>No active situation. Plant health and map status remain visible.</p>
      <p className="calm-card__empty-hint">Raw alarms stay available in the strip below — never hidden.</p>
    </div>
  );
}