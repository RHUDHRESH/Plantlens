import type { MapLayerId, MapMode, MapZoomBand, UserRole } from "../operational-map";
import { ALL_USER_ROLES, getLayerDefinition, getRoleLabel } from "../operational-map";

const ZOOM_BAND_LABELS: Record<MapZoomBand, string> = {
  plant: "Plant",
  area: "Area",
  asset: "Asset",
  component: "Component",
};

interface MapToolbarProps {
  mapMode: MapMode;
  onMapModeChange: (mode: MapMode) => void;
  role: UserRole;
  onRoleChange: (role: UserRole) => void;
  visibleLayers: Record<MapLayerId, boolean>;
  lockedLayers: MapLayerId[];
  onToggleLayer: (layerId: MapLayerId) => void;
  showLegend: boolean;
  onToggleLegend: () => void;
  showCausalPath: boolean;
  onToggleCausalPath: () => void;
  causalPathLocked: boolean;
  onFocusRoot?: () => void;
  hasRoot?: boolean;
  onFitPlant?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  canNavigate2D?: boolean;
  zoomBand?: MapZoomBand;
  scaleLabel?: string;
  density: "comfortable" | "compact";
  onDensityChange: (d: "comfortable" | "compact") => void;
  reducedMotion: boolean;
}

const TOGGLEABLE_LAYERS: MapLayerId[] = [
  "causal_path",
  "raw_alarms",
  "tags",
  "actions",
  "maintenance",
  "audit",
];

function causalPathLockTitle(layerId: MapLayerId, causalPathLocked: boolean): string | undefined {
  if (layerId !== "causal_path") return undefined;
  if (causalPathLocked) return "Causal path locked while Situation is active";
  return "Causal path locked by safety layer";
}

export function MapToolbar({
  mapMode,
  onMapModeChange,
  role,
  onRoleChange,
  visibleLayers,
  lockedLayers,
  onToggleLayer,
  showLegend,
  onToggleLegend,
  showCausalPath,
  onToggleCausalPath,
  causalPathLocked,
  onFocusRoot,
  hasRoot,
  onFitPlant,
  onZoomIn,
  onZoomOut,
  canNavigate2D = true,
  zoomBand,
  scaleLabel,
  density,
  onDensityChange,
  reducedMotion,
}: MapToolbarProps) {
  const lockedSet = new Set(lockedLayers);
  const navDisabled = mapMode !== "2d" || !canNavigate2D;
  const navTitle = mapMode !== "2d" ? "2D navigation only" : !canNavigate2D ? "Map controls loading" : undefined;

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

      <div className="pl-segmented map-toolbar__role" role="group" aria-label="Role lens">
        {ALL_USER_ROLES.map((r) => (
          <button
            key={r}
            type="button"
            className={`pl-segmented__btn${role === r ? " pl-segmented__btn--active" : ""}`}
            aria-pressed={role === r}
            onClick={() => onRoleChange(r)}
          >
            {getRoleLabel(r)}
          </button>
        ))}
      </div>

      <div className="map-toolbar__nav" role="group" aria-label="Map navigation">
        <button
          type="button"
          className="pl-btn pl-btn--compact"
          onClick={onFitPlant}
          disabled={navDisabled}
          title={navTitle}
          aria-label="Fit plant"
        >
          Fit plant
        </button>
        <button
          type="button"
          className="pl-btn pl-btn--compact"
          onClick={onZoomIn}
          disabled={navDisabled}
          title={navTitle}
          aria-label="Zoom in"
        >
          Zoom in
        </button>
        <button
          type="button"
          className="pl-btn pl-btn--compact"
          onClick={onZoomOut}
          disabled={navDisabled}
          title={navTitle}
          aria-label="Zoom out"
        >
          Zoom out
        </button>
        {hasRoot && onFocusRoot && (
          <button
            type="button"
            className="pl-btn pl-btn--compact"
            onClick={onFocusRoot}
            disabled={navDisabled}
            title={navTitle}
            aria-label="Focus root asset"
          >
            Focus root
          </button>
        )}
      </div>

      {zoomBand && (
        <span className="map-toolbar__zoom-band" role="status" aria-label={`Zoom band: ${ZOOM_BAND_LABELS[zoomBand]}`}>
          {ZOOM_BAND_LABELS[zoomBand]}
          {scaleLabel ? ` · ${scaleLabel}` : ""}
        </span>
      )}

      <button
        type="button"
        className={`pl-btn pl-btn--ghost pl-btn--compact${showLegend ? " map-toolbar__active" : ""}`}
        aria-pressed={showLegend}
        onClick={onToggleLegend}
      >
        Legend
      </button>

      <div className="map-toolbar__layers" role="group" aria-label="Map layers">
        {TOGGLEABLE_LAYERS.map((layerId) => {
          const def = getLayerDefinition(layerId);
          const locked = lockedSet.has(layerId);
          const active = layerId === "causal_path" ? showCausalPath : visibleLayers[layerId];
          const lockTitle = locked ? (causalPathLockTitle(layerId, causalPathLocked) ?? `${def.label} locked`) : undefined;
          const onClick =
            layerId === "causal_path"
              ? locked
                ? undefined
                : onToggleCausalPath
              : locked
                ? undefined
                : () => onToggleLayer(layerId);

          return (
            <button
              key={layerId}
              type="button"
              className={`pl-btn pl-btn--ghost pl-btn--compact${active ? " map-toolbar__active" : ""}${locked ? " map-toolbar__locked" : ""}`}
              aria-pressed={active}
              aria-disabled={locked}
              disabled={locked}
              title={lockTitle ?? def.description}
              onClick={onClick}
            >
              {def.label}
              {locked && <span className="map-toolbar__lock-mark" aria-hidden="true"> ·</span>}
            </button>
          );
        })}
      </div>

      {causalPathLocked && (
        <span className="map-toolbar__hint" role="status">
          Causal path locked
        </span>
      )}

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