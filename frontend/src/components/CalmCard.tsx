/**
 * CalmCard (Domain M) — fixed six-section structure, invariant regardless of
 * fault type. Consistency is the calming property. <10s readability discipline.
 *
 * Sections: (1) What/Situation, (2) Where, (3) Why (evidence), (4) Confidence &
 * coverage, (5) Action envelope, (6) Acknowledge.
 */
import { PressHoldAck } from "./PressHoldAck";
import type { Situation } from "../store/useStore";

export function CalmCard({ situation }: { situation: Situation }) {
  return (
    <div className="space-y-4">
      <section>
        <div className="text-xs uppercase tracking-wide text-white/50">What</div>
        <h2 className="text-lg font-semibold">{situation.primary_fault}</h2>
      </section>
      <section>
        <div className="text-xs uppercase tracking-wide text-white/50">Where</div>
        <div className="text-sm">M-101 (motor drive skid)</div>
      </section>
      <section>
        <div className="text-xs uppercase tracking-wide text-white/50">Why</div>
        <ul className="text-sm text-white/80">
          {situation.member_signals.map((s) => (
            <li key={s}>• {s}</li>
          ))}
        </ul>
      </section>
      <section className="flex gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-white/50">Confidence</div>
          <div className="text-xl font-bold">{(situation.confidence * 100).toFixed(0)}%</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-white/50">Coverage</div>
          <div className="text-xl font-bold">{(situation.coverage * 100).toFixed(0)}%</div>
        </div>
      </section>
      <section>
        <div className="text-xs uppercase tracking-wide text-white/50">Action envelope</div>
        <div className="text-sm">Reduce motor load — AVAILABLE (no blockers)</div>
      </section>
      <section>
        <PressHoldAck situationId={situation.id} />
      </section>
    </div>
  );
}
