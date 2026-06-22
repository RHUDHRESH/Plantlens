import type { MapZoomBand } from "./mapKernelTypes";
import { ALL_ZOOM_BANDS } from "./mapKernelTypes";

export const ZOOM_BAND_ORDER = {
  plant: 0,
  area: 1,
  asset: 2,
  component: 3,
} as const;

export function getZoomBandFromScale(scale: number): MapZoomBand {
  if (!Number.isFinite(scale) || scale <= 0) return "plant";
  if (scale < 0.75) return "plant";
  if (scale < 1.5) return "area";
  if (scale < 3) return "asset";
  return "component";
}

export function isZoomBandAtLeast(current: MapZoomBand, minimum: MapZoomBand): boolean {
  return ZOOM_BAND_ORDER[current] >= ZOOM_BAND_ORDER[minimum];
}

export function getNextZoomBand(current: MapZoomBand): MapZoomBand {
  const idx = ZOOM_BAND_ORDER[current];
  return ALL_ZOOM_BANDS[Math.min(idx + 1, ALL_ZOOM_BANDS.length - 1)] as MapZoomBand;
}

export function getPreviousZoomBand(current: MapZoomBand): MapZoomBand {
  const idx = ZOOM_BAND_ORDER[current];
  return ALL_ZOOM_BANDS[Math.max(idx - 1, 0)] as MapZoomBand;
}