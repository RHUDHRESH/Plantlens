import type { CalmCard as CalmCardType } from "../../app/schemas/calmCard";

interface CalmCardProps {
  card: CalmCardType;
  onViewRawAlarms?: () => void;
  onEscalate?: () => void;
  escalating?: boolean;
}

export function CalmCard({ card, onViewRawAlarms, onEscalate, escalating }: CalmCardProps) {
  const severityBorder =
    card.severity === "critical"
      ? "var(--status-critical)"
      : card.severity === "warning"
        ? "var(--status-warning)"
        : "var(--border)";

  return (
    <article
      className="calm-card"
      aria-labelledby="calm-card-title"
      style={{ borderColor: severityBorder }}
    >
      <header className="calm-card__header">
        <h2 id="calm-card-title">{card.title}</h2>
        <p className="calm-card__root" data-tabular>
          Root: <strong>{card.root_asset_name ?? card.root_asset_id}</strong>
        </p>
        {card.confidence && (
          <span className="calm-card__confidence">Confidence: {card.confidence}</span>
        )}
      </header>

      {card.first_signal && (
        <section className="calm-card__first-signal" aria-label="First signal">
          <h3>First signal</h3>
          <p>
            {card.first_signal.message}
            <span className="calm-card__ts" data-tabular>
              {" "}
              ({card.first_signal.timestamp})
            </span>
          </p>
        </section>
      )}

      {card.evidence_chain.length > 0 && (
        <section className="calm-card__evidence" aria-label="Evidence chain">
          <h3>Evidence chain</h3>
          <ol>
            {card.evidence_chain.map((item) => (
              <li key={`${item.order}-${item.alarm_id}`}>
                <span data-tabular>{item.order}.</span> {item.message}{" "}
                <span className="calm-card__asset" data-tabular>
                  ({item.asset_id})
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {card.why_it_matters && (
        <section className="calm-card__why">
          <h3>What changed</h3>
          <p>{card.why_it_matters}</p>
        </section>
      )}

      <section className="calm-card__check" aria-label="Best first check">
        <h3>Best first check</h3>
        <p>{card.recommended_first_check.label}</p>
        {card.recommended_first_check.requires_isolation && (
          <p className="calm-card__warn">Requires isolation before physical inspection.</p>
        )}
      </section>

      {card.time_to_consequence && (
        <section className="calm-card__ttc">
          <h3>Time to consequence</h3>
          <p>
            {card.time_to_consequence.target_label}: {card.time_to_consequence.state}
            {card.time_to_consequence.seconds_low != null && (
              <span data-tabular>
                {" "}
                (~{card.time_to_consequence.seconds_low}s)
              </span>
            )}
          </p>
        </section>
      )}

      {card.blocked_actions && card.blocked_actions.length > 0 && (
        <section className="calm-card__blocked" aria-label="Blocked actions">
          <h3>Blocked actions</h3>
          <ul>
            {card.blocked_actions.map((action) => (
              <li key={action.action_id}>
                <strong>{action.label}</strong> — {action.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="calm-card__footer">
        <button type="button" className="calm-card__raw-btn" onClick={onViewRawAlarms}>
          {card.raw_alarm_count} raw alarms grouped — view raw alarms
        </button>
        <p className="calm-card__authority">{card.operator_authority}</p>
        <button
          type="button"
          className="calm-card__escalate"
          onClick={onEscalate}
          disabled={!onEscalate || escalating}
        >
          {escalating ? "Escalating…" : "Escalate to Incident Room"}
        </button>
      </footer>
    </article>
  );
}

export function NoActiveSituation() {
  return (
    <div className="calm-card calm-card--empty" role="status">
      <h2>No active situation</h2>
      <p>Live runtime is connected. Raw alarms remain available below.</p>
    </div>
  );
}