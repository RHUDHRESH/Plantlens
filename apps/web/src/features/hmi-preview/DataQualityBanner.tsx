import type { DataQualityState } from "../../app/schemas/plantHmi";

interface DataQualityBannerProps {
  dataQuality: DataQualityState;
}

export function DataQualityBanner({ dataQuality }: DataQualityBannerProps) {
  const hasIssues =
    dataQuality.notes.length > 0 ||
    dataQuality.missing_signals.length > 0 ||
    dataQuality.stale_signals.length > 0 ||
    dataQuality.confidence_penalty > 0;

  if (!hasIssues) return null;

  return (
    <section className="hmi-data-quality" aria-label="Data quality" role="status">
      <h2 className="hmi-data-quality__title">Data quality</h2>
      {dataQuality.confidence_penalty > 0 && (
        <p className="hmi-meta">
          Confidence penalty <span data-tabular>{dataQuality.confidence_penalty.toFixed(2)}</span>
        </p>
      )}
      {dataQuality.missing_signals.length > 0 && (
        <p className="hmi-meta">Missing signals: {dataQuality.missing_signals.join(", ")}</p>
      )}
      {dataQuality.stale_signals.length > 0 && (
        <p className="hmi-meta">Stale signals: {dataQuality.stale_signals.join(", ")}</p>
      )}
      {dataQuality.notes.length > 0 && (
        <ul className="hmi-data-quality__notes">
          {dataQuality.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
