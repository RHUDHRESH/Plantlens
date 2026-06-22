import type { MapZoomBand } from "./mapKernelTypes";

export interface MapBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface MapViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface ViewportTransform {
  viewBox: MapViewBox;
  scale: number;
  zoomBand: MapZoomBand;
}

export interface ViewportFocusOptions {
  padding?: number;
  minWidth?: number;
  minHeight?: number;
}

export type ViewportCommand =
  | { type: "fit_bounds"; bounds: MapBounds; viewport: ViewportSize; padding?: number }
  | { type: "focus_point"; x: number; y: number; viewport: ViewportSize; zoomScale?: number }
  | { type: "zoom_at"; clientX: number; clientY: number; delta: number; svgRect: DOMRect }
  | { type: "pan_by"; dx: number; dy: number };