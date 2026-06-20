import { ObservabilityPanel } from "./ObservabilityPanel";
import { SensorRecommendationPanel } from "./SensorRecommendationPanel";
import type { AnalysisResult } from "./studioAnalysisApi";

type Props = {
  analysis: AnalysisResult | null;
  loading: boolean;
  error: string | null;
};

function CompileResult({ analysis }: { analysis: AnalysisResult }) {
  const obs = analysis.observability_matrix?.summary;
  const causal = analysis.causal_propagation_matrix;
  const coverage = obs && obs.total_faults > 0
    ? (obs.observable_faults / obs.total_faults)
    : null;
  const hasErrors = (analysis.errors?.length ?? 0) > 0;
  const hasWarnings = (analysis.warnings?.length ?? 0) > 0;
  const status = hasErrors ? "FAIL" : coverage != null && coverage < 0.4 ? "FAIL" : coverage != null && coverage < 0.75 ? "WARN" : "PASS";

  return (
    <div className={`compile-result compile-result--${status.toLowerCase()}`}>
      <div className="compile-result__status">
        <span className="compile-result__tag">{status === "PASS" ? "✓" : status === "WARN" ? "⚠" : "✕"} BUILD {status}</span>
        <span className="compile-result__mode">deterministic · read-only</span>
      </div>
      <div className="compile-result__grid">
        {obs && (
          <>
            <div className="compile-result__metric">
              <span className="compile-result__metric-val">{obs.total_faults}</span>
              <span className="compile-result__metric-key">FAULTS</span>
            </div>
            <div className="compile-result__metric">
              <span className="compile-result__metric-val">
                {obs.total_faults > 0 ? `${Math.round((obs.observable_faults / obs.total_faults) * 100)}%` : "—"}
              </span>
              <span className="compile-result__metric-key">COVERAGE</span>
            </div>
            <div className="compile-result__metric">
              <span className="compile-result__metric-val">{obs.unobservable_faults}</span>
              <span className="compile-result__metric-key">BLIND SPOTS</span>
            </div>
          </>
        )}
        {causal && (
          <div className="compile-result__metric">
            <span className="compile-result__metric-val">{causal.active_propagation_paths.length}</span>
            <span className="compile-result__metric-key">CAUSAL PATHS</span>
          </div>
        )}
      </div>
      {hasErrors && (
        <ul className="compile-result__issues">
          {analysis.errors?.map((e) => (
            <li key={e.code} className="compile-result__issue compile-result__issue--error">
              <span className="compile-result__issue-code">[E{e.code}]</span> {e.message}
            </li>
          ))}
        </ul>
      )}
      {hasWarnings && (
        <ul className="compile-result__issues">
          {analysis.warnings?.map((w) => (
            <li key={w.code} className="compile-result__issue compile-result__issue--warn">
              <span className="compile-result__issue-code">[W{w.code}]</span> {w.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MatrixPanel({ analysis, loading, error }: Props) {
  const faultMatrix = analysis?.fault_signature_matrix;
  const causal = analysis?.causal_propagation_matrix;

  return (
    <aside className="analysis-sidebar" aria-label="Engineering Analysis">
      <header className="analysis-sidebar__header">
        <h2>Engineering Analysis</h2>
        <p>Fault signatures, observability, sensor gaps — not runtime diagnosis.</p>
      </header>

      {loading ? (
        <div className="compile-loading">
          <span>⟳</span> Compiling assembly…
        </div>
      ) : null}
      {error ? <p className="analysis-panel__error" role="alert">✕ {error}</p> : null}

      {analysis ? <CompileResult analysis={analysis} /> : null}

      {faultMatrix ? (
        <section className="analysis-panel">
          <h3>Fault signature matrix</h3>
          <ul className="analysis-panel__stats">
            <li><span>Enabled fault modes</span><strong>{faultMatrix.fault_count}</strong></li>
          </ul>
        </section>
      ) : null}

      <ObservabilityPanel analysis={analysis} />
      <SensorRecommendationPanel analysis={analysis} />

      {causal ? (
        <section className="analysis-panel">
          <h3>Causal graph</h3>
          <ul className="analysis-panel__stats">
            <li><span>Active propagation paths</span><strong>{causal.active_propagation_paths.length}</strong></li>
            <li><span>Monitoring edges excluded</span><strong>{causal.monitoring_edges_excluded_count}</strong></li>
            <li><span>Unapproved excluded</span><strong>{causal.unapproved_edges_excluded_count}</strong></li>
          </ul>
          {(causal.errors ?? []).length > 0 ? (
            <ul className="compile-result__issues">
              {causal.errors.map((err) => (
                <li key={err.code} className="compile-result__issue compile-result__issue--error">
                  <span className="compile-result__issue-code">[E{err.code}]</span> {err.message}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </aside>
  );
}
