import type { CalmCardTimeToConsequence } from "../../app/schemas/calmCard";

export function TimeToConsequenceRing({ ttc }: { ttc: CalmCardTimeToConsequence }) {
  return (
    <section className="calm-card__ttc" aria-label="Time to consequence">
      <h3>Time to consequence</h3>
      <div className="calm-card__ttc-block">
        <p className="calm-card__ttc-label">{ttc.target_label}</p>
        <p className="calm-card__ttc-state data-number">{ttc.state}</p>
        {ttc.seconds_low != null && ttc.seconds_high != null && (
          <p className="calm-card__ttc-band data-number">
            ~{Math.round(ttc.seconds_low)}–{Math.round(ttc.seconds_high)}s (advisory band)
          </p>
        )}
      </div>
    </section>
  );
}