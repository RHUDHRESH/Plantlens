/** Engineering analysis (observability + sensor gaps) — design-time only, never runtime diagnosis. */
import { Play } from "lucide-react";
import { useState } from "react";
import type { PlantAssembly } from "../../app/schemas/plantAssembly";
import { Button, ErrorNotice, Mono } from "../../components/ui/primitives";
import { analyzeAssembly, type AnalysisResult } from "./studioAnalysisApi";
import { selectAssembly, useStudioStore } from "./studioStore";

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="st-metric">
      <Mono className="st-metric__value">{value}</Mono>
      <span className="st-metric__label">{label}</span>
    </div>
  );
}

export function AnalysisPanel() {
  const assembly = useStudioStore(selectAssembly);
  const [result, setResult] = useState<{ for: PlantAssembly; data: AnalysisResult } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = async () => {
    setLoading(true);
    setError(null);
    const snapshot = assembly;
    try {
      setResult({ for: snapshot, data: await analyzeAssembly(snapshot) });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };
  const data = result?.data;
  const obs = data?.observability_matrix?.summary;
  const recs = data?.sensor_recommendations?.recommended_sensors ?? [];
  const coverage = obs && obs.total_faults ? Math.round((obs.observable_faults / obs.total_faults) * 100) : null;
  return (
    <div className="st-analysis">
      <p className="st-muted">Fault observability and sensor gaps for this assembly. Deterministic, read-only — not runtime diagnosis.</p>
      <div className="st-analysis__run">
        <Button size="sm" icon={<Play />} busy={loading} disabled={!assembly.assets.length} onClick={() => void run()}>
          Analyse assembly
        </Button>
        {result && result.for !== assembly ? <span className="st-muted">Assembly changed since this analysis.</span> : null}
      </div>
      {error ? <ErrorNotice error={error} /> : null}
      {data ? (
        <>
          <div className="st-metrics">
            <Metric label="Fault modes" value={obs?.total_faults ?? data.fault_signature_matrix?.fault_count ?? 0} />
            <Metric label="Observable" value={coverage === null ? "—" : `${coverage}%`} />
            <Metric label="Blind spots" value={obs?.unobservable_faults ?? 0} />
            <Metric label="Causal paths" value={data.causal_propagation_matrix?.active_propagation_paths.length ?? 0} />
          </div>
          {data.causal_propagation_matrix ? (
            <p className="st-muted st-note">
              {data.causal_propagation_matrix.unapproved_edges_excluded_count} draft connection(s) excluded from causal paths until approved.
            </p>
          ) : null}
          {recs.length ? (
            <section className="st-inspector__section">
              <div className="st-inspector__section-head">
                <h3>Suggested sensors</h3>
              </div>
              <ul className="st-recs">
                {recs.slice(0, 6).map((r, i) => (
                  <li key={`${r.component_type_id}-${i}`}>
                    <strong>{r.component_type_id.replace(/_/g, " ")}</strong>
                    <span>{r.placement_hint}</span>
                    <Mono className="st-recs__gain">+{Math.round(r.marginal_gain * 100)}%</Mono>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
