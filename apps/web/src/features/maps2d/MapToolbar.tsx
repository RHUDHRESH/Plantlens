interface MapToolbarProps {
  mapMode: "2d" | "3d";
  onMapModeChange: (mode: "2d" | "3d") => void;
  showLegend: boolean;
  onToggleLegend: () => void;
  showCausalPath: boolean;
  onToggleCausalPath: () => void;
  onFocusRoot?: () => void;
  hasRoot?: boolean;
  density: "comfortable" | "compact";
  onDensityChange: (d: "comfortable" | "compact") => void;
  reducedMotion: boolean;
}

export function MapToolbar({
  mapMode,
  onMapModeChange,
  showLegend,
  onToggleLegend,
  showCausalPath,
  onToggleCausalPath,
  onFocusRoot,
  hasRoot,
  density,
  onDensityChange,
  reducedMotion,
}: MapToolbarProps) {
  return (
    <div className="map-toolbar" role="toolbar" aria-label="Map controls">
      <div className="pl-segmented" role="group" aria-label="Map view mode">
        <button
          type="button"
          className={`pl-segmented__btn${mapMode === "2d" ? " pl-segmented__btn--active" : ""}`}
          aria-pressed={mapMode === "2d"}
          onClick={() => onMapModeChange("2d")}
        >
          2D
        </button>
        <button
          type="button"
          className={`pl-segmented__btn${mapMode === "3d" ? " pl-segmented__btn--active" : ""}`}
          aria-pressed={mapMode === "3d"}
          onClick={() => onMapModeChange("3d")}
        >
          3D
        </button>
      </div>

      {hasRoot && onFocusRoot && (
        <button type="button" className="pl-btn pl-btn--compact" onClick={onFocusRoot} aria-label="Focus root asset">
          Focus root
        </button>
      )}

      <button
        type="button"
        className={`pl-btn pl-btn--ghost pl-btn--compact${showLegend ? " map-toolbar__active" : ""}`}
        aria-pressed={showLegend}
        onClick={onToggleLegend}
      >
        Legend
      </button>

      <button
        type="button"
        className={`pl-btn pl-btn--ghost pl-btn--compact${showCausalPath ? " map-toolbar__active" : ""}`}
        aria-pressed={showCausalPath}
        onClick={onToggleCausalPath}
      >
        Causal path
      </button>

      <button
        type="button"
        className="pl-btn pl-btn--ghost pl-btn--compact"
        aria-pressed={density === "compact"}
        onClick={() => onDensityChange(density === "compact" ? "comfortable" : "compact")}
      >
        {density === "compact" ? "Comfortable" : "Compact"}
      </button>

      {reducedMotion && <span className="map-toolbar__hint">Reduced motion</span>}
    </div>
  );
}