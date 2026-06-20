import type { PlantHMIState } from "../../app/schemas/plantHmi";
import { formatConfidence } from "./hmiFormatting";

interface DataQualityBannerProps {
  state: PlantHMIState;
  errorMessage?: string | null;
}

export function DataQualityBanner({ state, errorMessage }: DataQualityBannerProps) {
  const { data_quality: dq } = state;
  const show =
    Boolean(errorMessage) ||
    state.overall_status === "blocked" ||
    dq.confidence_penalty > 0 ||
    dq.missing_signals.length > 0 ||
    dq.stale_signals.length > 0 ||
    dq.notes.length > 0;

  if (!show) return null;

  const blocked = state.overall_status === "blocked";

  return (
    <section
      className={`data-quality-banner${blocked ? " data-quality-banner--blocked" : ""}`}
      aria-label="Data quality"
      role="alert"
    >
      <h3 className="data-quality-banner__title">Data quality</h3>
      {blocked && (
        <p className="data-quality-banner__blocked">HMI projection blocked.</p>
      )}
      {errorMessage && <p className="data-quality-banner__error">{errorMessage}</p>}
      {dq.confidence_penalty > 0 && (
        <p>
          Confidence penalty: <span className="data-number">{formatConfidence(dq.confidence_penalty)}</span>
        </p>
      )}
      {dq.missing_signals.length > 0 && (
        <p>Missing signals: {dq.missing_signals.join(", ")}</p>
      )}
      {dq.stale_signals.length > 0 && (
        <p>Stale signals: {dq.stale_signals.join(", ")}</p>
      )}
      {dq.notes.length > 0 && (
        <ul className="data-quality-banner__list">
          {dq.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </section>
  );
}