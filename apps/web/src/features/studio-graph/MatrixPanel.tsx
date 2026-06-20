import { ObservabilityPanel } from "./ObservabilityPanel";
import { SensorRecommendationPanel } from "./SensorRecommendationPanel";
import type { AnalysisResult } from "./studioAnalysisApi";

type Props = {
  analysis: AnalysisResult | null;
  loading: boolean;
  error: string | null;
};

export function MatrixPanel({ analysis, loading, error }: Props) {
  const faultMatrix = analysis?.fault_signature_matrix;
  const causal = analysis?.causal_propagation_matrix;

  return (
    <aside className="analysis-sidebar" aria-label="Engineering Analysis">
      <header className="analysis-sidebar__header">
        <h2>Engineering Analysis</h2>
        <p>Deterministic fault signatures, observability, and sensor gaps — not runtime diagnosis.</p>
      </header>

      {loading ? <p className="analysis-panel__empty">Analyzing assembly…</p> : null}
      {error ? <p className="analysis-panel__error" role="alert">{error}</p> : null}

      {faultMatrix ? (
        <section className="analysis-panel">
          <h3>Fault signature summary</h3>
          <ul className="analysis-panel__stats">
            <li><span>Enabled fault modes</span><strong>{faultMatrix.fault_count}</strong></li>
          </ul>
        </section>
      ) : null}

      <ObservabilityPanel analysis={analysis} />
      <SensorRecommendationPanel analysis={analysis} />

      {causal ? (
        <section className="analysis-panel">
          <h3>Causal graph summary</h3>
          <ul className="analysis-panel__stats">
            <li><span>Approved causal paths</span><strong>{causal.active_propagation_paths.length}</strong></li>
            <li><span>Monitoring edges excluded</span><strong>{causal.monitoring_edges_excluded_count}</strong></li>
            <li><span>Unapproved excluded</span><strong>{causal.unapproved_edges_excluded_count}</strong></li>
          </ul>
          {(causal.errors ?? []).length > 0 ? (
            <ul className="analysis-panel__warnings">
              {causal.errors.map((err) => (
                <li key={err.code}>{err.message}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </aside>
  );
}