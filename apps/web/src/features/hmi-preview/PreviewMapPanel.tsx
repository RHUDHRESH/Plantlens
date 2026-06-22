import { PlantMap2D } from "../maps2d/PlantMap2D";
import type { LocalHmiPreviewModel } from "./previewTypes";
import {
  buildPreviewAssetStatus,
  previewModelToMapEdges,
  previewModelToMapNodes,
} from "./previewMapAdapter";

interface PreviewMapPanelProps {
  model: LocalHmiPreviewModel | null;
  selectedAssetId?: string | null;
  onSelectAsset?: (assetId: string) => void;
  invalid?: boolean;
}

export function PreviewMapPanel({
  model,
  selectedAssetId,
  onSelectAsset,
  invalid = false,
}: PreviewMapPanelProps) {
  if (invalid || !model) {
    return (
      <section className="preview-map-panel" aria-label="Preview map">
        <p className="preview-map-panel__note">
          {invalid
            ? "Fix draft validation errors before generating a local preview."
            : "Generate a local preview to render the read-only map."}
        </p>
      </section>
    );
  }

  const nodes = previewModelToMapNodes(model);
  const edges = previewModelToMapEdges(model);
  const assetStatus = buildPreviewAssetStatus(model);
  const hasFallback = model.summary.fallbackCoordinateCount > 0;

  return (
    <section className="preview-map-panel" aria-label="Preview map">
      <div className="preview-map-panel__header">
        <span className="preview-readonly-badge">Preview has no live telemetry.</span>
        {hasFallback ? (
          <span className="preview-warning">
            {model.summary.fallbackCoordinateCount} asset(s) use fallback coordinates.
          </span>
        ) : null}
      </div>
      <PlantMap2D
        nodes={nodes}
        edges={edges}
        assetStatus={assetStatus}
        reducedMotion
        showLegend={false}
        focusAssetId={selectedAssetId ?? null}
        {...(onSelectAsset ? { onSelectAsset } : {})}
        role="engineer"
      />
      {model.map3d.nodes.length > 0 ? (
        <div className="preview-map-panel__3d-summary">
          <h4>3D preview summary</h4>
          <p className="preview-map-panel__note">
            {model.map3d.nodes.length} nodes · {model.map3d.edges.length} edges (read-only summary, no
            live 3D viewport in local preview).
          </p>
          <ul>
            {model.map3d.nodes.slice(0, 6).map((n) => (
              <li key={n.id}>
                {n.label} ({n.id}) — ({n.position.x}, {n.position.y}, {n.position.z})
              </li>
            ))}
            {model.map3d.nodes.length > 6 ? (
              <li>…and {model.map3d.nodes.length - 6} more</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </section>
  );
}