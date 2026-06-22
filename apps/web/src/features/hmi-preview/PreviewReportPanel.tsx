import type { LocalHmiPreviewModel } from "./previewTypes";

interface PreviewReportPanelProps {
  model: LocalHmiPreviewModel | null;
}

export function PreviewReportPanel({ model }: PreviewReportPanelProps) {
  if (!model) return null;

  const { summary } = model;

  return (
    <section className="preview-report-panel" aria-label="Preview report">
      <h3>Preview report</h3>
      <p className="preview-report-panel__note">
        Deterministic local projection from the Studio draft bundle. Not saved and not applied to
        runtime.
      </p>
      <dl className="preview-report-panel__meta">
        <div>
          <dt>Plant ID</dt>
          <dd>{model.plantId}</dd>
        </div>
        <div>
          <dt>Generated at</dt>
          <dd>{model.generatedAt}</dd>
        </div>
      </dl>
      <ul className="preview-report-panel__summary">
        <li>{summary.assetCount} assets</li>
        <li>{summary.tagCount} tags</li>
        <li>{summary.alarmRuleCount} alarm rules</li>
        <li>{summary.causalEdgeCount} causal edges</li>
        <li>{summary.actionCount} actions</li>
        <li>
          {model.map2d.edges.length} map edges ({model.map3d.nodes.length} 3D nodes)
        </li>
        {summary.fallbackCoordinateCount > 0 ? (
          <li className="preview-warning">
            {summary.fallbackCoordinateCount} asset(s) use fallback coordinates
          </li>
        ) : null}
      </ul>
    </section>
  );
}