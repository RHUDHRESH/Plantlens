import { Maximize2, Minus, Plus } from "lucide-react";
import { IconButton } from "../../components/ui/primitives";

/** Zoom/fit cluster for SVG canvases (Overview map, causal graph). */
export function MapControls({ onZoomIn, onZoomOut, onFit }: { onZoomIn: () => void; onZoomOut: () => void; onFit: () => void }) {
  return (
    <div className="ops-map-controls" role="toolbar" aria-label="Zoom">
      <IconButton label="Zoom in (+)" icon={<Plus />} size="sm" onClick={onZoomIn} />
      <IconButton label="Zoom out (−)" icon={<Minus />} size="sm" onClick={onZoomOut} />
      <IconButton label="Fit to view (0)" icon={<Maximize2 />} size="sm" onClick={onFit} />
    </div>
  );
}
