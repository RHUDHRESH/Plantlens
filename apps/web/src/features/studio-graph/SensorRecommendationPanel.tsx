import type { AnalysisResult } from "./studioAnalysisApi";

type Props = {
  analysis: AnalysisResult | null;
};

export function SensorRecommendationPanel({ analysis }: Props) {
  const recs = analysis?.sensor_recommendations;
  if (!recs) {
    return <p className="analysis-panel__empty">Sensor recommendations appear after analysis.</p>;
  }

  const top = recs.recommended_sensors.slice(0, 5);

  return (
    <section className="analysis-panel" aria-label="Sensor recommendations">
      <h3>Top missing sensors</h3>
      <p className="analysis-muted">
        Coverage {recs.coverage_before.toFixed(2)} → {recs.coverage_after.toFixed(2)} (engineering estimate)
      </p>
      {top.length === 0 ? (
        <p className="analysis-panel__empty">No additional sensors recommended at current coverage.</p>
      ) : (
        <ul className="analysis-panel__list">
          {top.map((sensor) => (
            <li key={`${sensor.component_type_id}-${sensor.measured_quantity}`}>
              <strong>{sensor.component_type_id}</strong>
              <span>{sensor.measured_quantity}</span>
              <span className="analysis-muted">Marginal gain: {sensor.marginal_gain.toFixed(2)}</span>
              <span className="analysis-muted">{sensor.placement_hint}</span>
              {sensor.faults_improved.length > 0 ? (
                <span className="analysis-muted">Improves: {sensor.faults_improved.slice(0, 2).join(", ")}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}