import type { AnalysisResult } from "./studioAnalysisApi";

type Props = {
  analysis: AnalysisResult | null;
};

export function ObservabilityPanel({ analysis }: Props) {
  const summary = analysis?.observability_matrix?.summary;
  const rows = analysis?.observability_matrix?.fault_observability ?? [];

  if (!summary) {
    return <p className="analysis-panel__empty">Run engineering analysis to see observability coverage.</p>;
  }

  const weakOrUnobservable = rows.filter(
    (r) => r.observability_class !== "observable",
  ).slice(0, 6);

  return (
    <section className="analysis-panel" aria-label="Observability summary">
      <h3>Fault coverage summary</h3>
      <ul className="analysis-panel__stats">
        <li><span>Observable</span><strong>{summary.observable_faults}</strong></li>
        <li><span>Weakly observable</span><strong>{summary.weakly_observable_faults}</strong></li>
        <li><span>Unobservable</span><strong>{summary.unobservable_faults}</strong></li>
        <li><span>Avg confidence ceiling</span><strong>{summary.average_confidence_ceiling.toFixed(2)}</strong></li>
      </ul>
      {weakOrUnobservable.length > 0 ? (
        <>
          <h4>Uncertainty (engineering view)</h4>
          <ul className="analysis-panel__list">
            {weakOrUnobservable.map((row) => (
              <li key={row.fault_key}>
                <span className={`analysis-badge analysis-badge--${row.observability_class}`}>
                  {row.observability_class.replace("_", " ")}
                </span>
                <span>{row.fault_key}</span>
                <span className="analysis-muted">Confidence ceiling: {row.confidence_ceiling.toFixed(2)}</span>
                {row.missing_required_signals.length > 0 ? (
                  <span className="analysis-muted">Missing: {row.missing_required_signals.join(", ")}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}