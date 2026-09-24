import { ArrowRight, Info, Lock, ShieldAlert, Timer } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Mono, StatusBadge } from "../../components/ui/primitives";
import { EquipmentSymbol, symbolForAssetType } from "../../components/symbols";
import { formatAge, formatClock, formatValue } from "../operational-map/format";
import { SectionLabel } from "../operational-map/SideSheet";
import type { CalmCardView } from "./calmCardModel";
import "../operational-map/ops.css";
import "./calm-card.css";

const CONFIDENCE_LABEL: Record<string, string> = { high: "High", medium: "Medium", low: "Low", unknown: "Unknown" };

/**
 * Calm Card — the decision layer. Visual priority: title → root asset → first signal → evidence
 * chain → best check → blocked actions → raw alarms. Colour appears only on the severity badge
 * and the root symbol outline; everything else is ink on surface.
 */
export function CalmCard({
  view,
  now,
  rootStatus,
  actions,
  rawAlarmsHref = "/ops/alarms?tab=grouped",
}: {
  view: CalmCardView;
  now: number;
  rootStatus?: CalmCardView["status"];
  actions?: ReactNode;
  rawAlarmsHref?: string;
}) {
  const c = view.confidence;
  return (
    <article className="cc" aria-labelledby="cc-title">
      <header className="cc-head">
        <div className="cc-eyebrow">
          <span>Active situation</span>
          {view.since ? (
            <span>
              since <Mono>{formatClock(view.since)}</Mono> · {formatAge(now - view.since)}
            </span>
          ) : null}
        </div>
        <div className="cc-title-row">
          <h2 id="cc-title" className="cc-title">
            {view.title}
          </h2>
          <StatusBadge status={view.status} label={view.severityLabel} />
        </div>
      </header>

      <div className="cc-root">
        <EquipmentSymbol kind={symbolForAssetType(view.rootAssetType)} size={40} status={rootStatus ?? view.status} />
        <div className="cc-root__text">
          <div className="cc-label">Likely root</div>
          <div className="cc-root__name">{view.rootAssetName}</div>
          <div className="ops-id">{view.rootAssetId}</div>
        </div>
        <div className={`cc-conf cc-conf--${c.bucket}`} title="Confidence bucket from the causal engine">
          <span className="cc-conf__bars" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span>{CONFIDENCE_LABEL[c.bucket] ?? c.bucket} confidence</span>
        </div>
      </div>

      {view.whyItMatters ? <p className="cc-why">{view.whyItMatters}</p> : null}

      {view.firstSignal ? (
        <section className="cc-block">
          <SectionLabel aside={view.firstSignal.ts ? <Mono>{formatClock(view.firstSignal.ts, true)}</Mono> : null}>
            First signal
          </SectionLabel>
          <div className="cc-first">
            <span className="cc-first__msg">{view.firstSignal.message}</span>
            <span className="ops-muted">
              {view.firstSignal.assetName}
              {view.firstSignal.value !== null && view.firstSignal.value !== undefined ? (
                <>
                  {" · "}
                  <Mono>{formatValue(view.firstSignal.value, view.firstSignal.unit)}</Mono>
                </>
              ) : null}
            </span>
          </div>
        </section>
      ) : null}

      {view.evidence.length ? (
        <section className="cc-block">
          <SectionLabel aside="in onset order">Evidence chain</SectionLabel>
          <ol className="cc-chain">
            {view.evidence.map((e, i) => (
              <li key={e.alarmId} className="cc-chain__item" style={{ "--i": i } as CSSProperties}>
                <span className={`cc-chain__n${e.isFirst ? " is-first" : ""}`} aria-hidden>
                  {e.order}
                </span>
                <span className="cc-chain__msg">
                  {e.message}
                  <span className="cc-chain__asset">{e.assetName}</span>
                </span>
                <Mono className="cc-chain__t">{e.offset}</Mono>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {view.bestCheck ? (
        <section className="cc-check" aria-label="Best first check">
          <div className="cc-label">Check first</div>
          <div className="cc-check__label">{view.bestCheck.label}</div>
          <div className="cc-check__meta">
            <span>Risk {view.bestCheck.risk}</span>
            {view.bestCheck.requiresIsolation ? (
              <span className="cc-check__iso">
                <ShieldAlert aria-hidden /> Isolate before touching
              </span>
            ) : null}
          </div>
        </section>
      ) : null}

      {view.blocked.length ? (
        <section className="cc-block">
          <SectionLabel>Blocked actions</SectionLabel>
          <ul className="cc-blocked">
            {view.blocked.map((b) => (
              <li key={b.label}>
                <Lock aria-hidden />
                <span>
                  <strong>{b.label}</strong> — {b.reason}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {view.timeToConsequence ? (
        <div className="cc-ttc">
          <Timer aria-hidden />
          <span>
            <strong>{view.timeToConsequence.label}:</strong> {view.timeToConsequence.text}{" "}
            <span className="ops-subtle">Advisory projection, not a trip.</span>
          </span>
        </div>
      ) : null}

      {view.unexplained.length ? (
        <div className="ops-callout ops-callout--attention" role="note">
          <strong>
            {view.unexplained.length} alarm{view.unexplained.length === 1 ? " is" : "s are"} not explained by this root.
          </strong>{" "}
          Handle {view.unexplained.length === 1 ? "it" : "them"} separately:{" "}
          {view.unexplained.map((u, i) => (
            <span key={u.id}>
              {i ? ", " : ""}
              {u.message} ({u.assetName})
            </span>
          ))}
          .
        </div>
      ) : null}

      {view.loopNote ? (
        <div className="ops-callout" role="note">
          <strong>Feedback loop.</strong> {view.loopNote}
        </div>
      ) : null}

      <Link className="cc-raw" to={rawAlarmsHref}>
        <span>
          <strong>{view.rawCount}</strong> raw alarm{view.rawCount === 1 ? "" : "s"} grouped — view raw alarms
        </span>
        <ArrowRight aria-hidden />
      </Link>

      <details className="cc-why-conf">
        <summary>
          <Info aria-hidden />
          Why {CONFIDENCE_LABEL[c.bucket]?.toLowerCase() ?? c.bucket} confidence?
        </summary>
        {c.terms.length ? (
          <ul className="cc-terms">
            {c.terms.map((t) => (
              <li key={t.key} className={t.concern ? "is-concern" : undefined}>
                <span className="cc-terms__label">{t.label}</span>
                {t.key === "contradictions" ? (
                  <span className="cc-terms__count">
                    <Mono>{t.display}</Mono>
                  </span>
                ) : (
                  <span className="cc-terms__bar" aria-hidden>
                    <i style={{ width: `${Math.max(0, Math.min(1, t.value)) * 100}%` }} />
                  </span>
                )}
                {t.key !== "contradictions" ? <Mono className="cc-terms__v">{t.display}</Mono> : <span />}
                <span className="cc-terms__explain">{t.explain}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ops-empty-inline">The runtime did not send a score breakdown for this situation.</p>
        )}
        {c.margin ? (
          <p className="cc-margin">
            {c.margin.competitorName ? (
              <>
                Leads the next candidate, <strong>{c.margin.competitorName}</strong>, by <Mono>{c.margin.value.toFixed(2)}</Mono>.
                A small lead lowers confidence even when every term is strong.
              </>
            ) : (
              <>No competing root explains the same alarms.</>
            )}
          </p>
        ) : null}
        {view.traceId ? (
          <p className="ops-subtle cc-trace">
            Trace <Mono>{view.traceId}</Mono> · deterministic, approved edges only
          </p>
        ) : null}
      </details>

      <footer className="cc-foot">
        <p className="cc-authority">{view.authority}</p>
        {actions ? <div className="cc-actions">{actions}</div> : null}
      </footer>
    </article>
  );
}
