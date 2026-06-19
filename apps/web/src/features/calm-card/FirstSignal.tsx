import type { CalmCardFirstSignal } from "../../app/schemas/calmCard";

export function FirstSignal({ signal }: { signal: CalmCardFirstSignal }) {
  return (
    <section className="calm-card__first-signal" aria-label="First signal">
      <div className="calm-card__section-head">
        <h3>First signal</h3>
        <span className="calm-card__changed-first">Changed first</span>
      </div>
      <p className="calm-card__signal-body">
        {signal.message}
        <span className="calm-card__ts data-number"> ({signal.timestamp})</span>
      </p>
      <p className="calm-card__asset-ref data-number">
        {signal.asset_id} · {signal.alarm_id}
      </p>
    </section>
  );
}