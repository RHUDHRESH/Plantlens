import type { CalmCardRecommendedCheck } from "../../app/schemas/calmCard";

export function RecommendedAction({ check }: { check: CalmCardRecommendedCheck }) {
  return (
    <section className="calm-card__check" aria-label="Recommended first check">
      <h3>Best first check</h3>
      <div className="calm-card__action-block">
        <p className="calm-card__action-label">{check.label}</p>
        <span className="calm-card__risk data-number">Risk: {check.risk_level}</span>
        {check.requires_isolation && (
          <p className="calm-card__warn">Requires isolation before physical inspection.</p>
        )}
      </div>
    </section>
  );
}