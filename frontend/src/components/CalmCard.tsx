/**
 * CalmCard (Domain M) — fixed six-section structure, invariant regardless of
 * fault type. Consistency is the calming property. <10s readability discipline.
 */
import { PressHoldAck } from "./PressHoldAck";
import { getSituationMeta } from "../data/demoPlant";
import type { Situation } from "../store/useStore";
import { Badge } from "./ui/Badge";
import { Metric } from "./ui/Metric";

export function CalmCard({ situation }: { situation: Situation }) {
  const meta = getSituationMeta(situation.id);

  return (
    <div className="pl-calm-card">
      <section className="pl-calm-card__section">
        <span className="pl-label">What</span>
        <h2 className="pl-calm-card__headline">{situation.primary_fault}</h2>
        {meta && (
          <Badge variant={meta.severity === "unknown" ? "unknown" : "warning"}>
            {meta.severity}
          </Badge>
        )}
      </section>

      <section className="pl-calm-card__section">
        <span className="pl-label">Where</span>
        <p className="pl-calm-card__text">
          {meta?.location ?? "Location pending"}
          {!meta && <span className="pl-scaffold-tag">Demo fallback</span>}
        </p>
      </section>

      <section className="pl-calm-card__section">
        <span className="pl-label">Why</span>
        {meta ? (
          <>
            <ul className="pl-evidence-list pl-evidence-list--support">
              {meta.supportingEvidence.map((e) => (
                <li key={e}>+ {e}</li>
              ))}
            </ul>
            <ul className="pl-evidence-list pl-evidence-list--missing">
              {meta.missingEvidence.map((e) => (
                <li key={e}>? {e}</li>
              ))}
            </ul>
          </>
        ) : (
          <ul className="pl-evidence-list pl-evidence-list--support">
            {situation.member_signals.map((s) => (
              <li key={s}>+ {s}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="pl-calm-card__metrics">
        <Metric
          label="Confidence"
          value={`${(situation.confidence * 100).toFixed(0)}%`}
          size="lg"
        />
        <Metric
          label="Coverage"
          value={`${(situation.coverage * 100).toFixed(0)}%`}
          size="lg"
        />
      </section>

      <section className="pl-calm-card__section">
        <span className="pl-label">Action envelope</span>
        <p className="pl-calm-card__text">
          {meta?.actionEnvelope ?? "Action envelope pending — scaffold"}
        </p>
        {meta?.nextSteps && (
          <p className="pl-calm-card__next">Next: {meta.nextSteps}</p>
        )}
        <Badge variant="readonly">Read-only</Badge>
      </section>

      <section className="pl-calm-card__section">
        <span className="pl-label">Acknowledge</span>
        <PressHoldAck situationId={situation.id} />
      </section>
    </div>
  );
}