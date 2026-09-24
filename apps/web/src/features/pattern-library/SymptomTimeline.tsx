import type { PatternSymptom } from "../../api/v2";
import { formatLagWindow } from "../approvals/diffFormat";
import { barExtent, directionOf, scaleForSymptoms, thresholdText, weightOpacity } from "./timelineScale";

/**
 * Horizontal onset windows per symptom relative to the trigger onset (t = 0) on a log-ish axis.
 * Bar opacity encodes weight (also printed as text); arrows give direction.
 */
export function SymptomTimeline({ symptoms, triggerRole }: { symptoms: readonly PatternSymptom[]; triggerRole: string }) {
  const scale = scaleForSymptoms(symptoms);
  const rows = [...symptoms].sort(
    (a, b) =>
      Number(b.role === triggerRole) - Number(a.role === triggerRole) ||
      a.onset_lag_ms[0] - b.onset_lag_ms[0] ||
      b.weight - a.weight,
  );
  return (
    <div className="plib-tl" role="table" aria-label="Symptom onset windows relative to the trigger">
      <div className="plib-tl__row plib-tl__row--axis" role="row">
        <div className="plib-tl__role" role="columnheader">Symptom · threshold hint</div>
        <div className="plib-tl__track plib-tl__axis" role="columnheader" aria-label="Onset after trigger (log scale)">
          {scale.ticks.map((t) => (
            <span
              key={t.ms}
              className="plib-tl__tick"
              style={{ left: `${t.pos * 100}%` }}
              data-edge={t.pos === 0 ? "start" : t.pos === 1 ? "end" : undefined}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>
      {rows.map((s) => {
        const ext = barExtent(scale, s.onset_lag_ms);
        const dir = directionOf(s.direction);
        const trigger = s.role === triggerRole;
        const lagText = formatLagWindow(s.onset_lag_ms);
        return (
          <div key={`${s.role}-${s.direction}`} className={`plib-tl__row${trigger ? " is-trigger" : ""}`} role="row">
            <div className="plib-tl__role" role="rowheader" title={s.note}>
              <span className="plib-tl__name">
                <span className="plib-tl__dir" aria-hidden title={dir.label}>
                  {dir.glyph}
                </span>
                <span className="pl-mono">{s.role}</span>
                <span className="plib-tl__dirtext">{dir.label}</span>
                {trigger ? <span className="plib-tl__trigger">trigger</span> : null}
              </span>
              {thresholdText(s) ? <span className="plib-tl__hint pl-mono">{thresholdText(s)}</span> : null}
              {s.note ? <span className="plib-tl__note">{s.note}</span> : null}
            </div>
            <div className="plib-tl__track" role="cell">
              {scale.ticks.map((t) => (
                <span key={t.ms} className="plib-tl__grid" style={{ left: `${t.pos * 100}%` }} aria-hidden />
              ))}
              <span
                className={`plib-tl__bar${ext.instant ? " plib-tl__bar--instant" : ""}`}
                style={{ left: `${ext.start * 100}%`, width: `${ext.width * 100}%`, opacity: weightOpacity(s.weight) }}
                title={`${s.role} ${dir.label} ${lagText} after trigger · weight ${s.weight}`}
              />
              <span
                className="plib-tl__lag pl-mono"
                style={ext.start + ext.width > 0.72 ? { right: `${(1 - ext.start) * 100 + 1}%` } : { left: `calc(${(ext.start + ext.width) * 100}% + 6px)` }}
              >
                {s.onset_lag_ms[0] === 0 && s.onset_lag_ms[1] === 0 ? "at onset" : lagText}
                <span className="plib-tl__w"> · w {s.weight}</span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
