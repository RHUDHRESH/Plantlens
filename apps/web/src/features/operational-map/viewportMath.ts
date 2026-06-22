import { getZoomBandFromScale } from "./zoomBands";
import type { MapBounds, MapViewBox, ViewportSize, ViewportTransform } from "./viewportTypes";

const FALLBACK_BOUNDS: MapBounds = { minX: 0, minY: 0, maxX: 800, maxY: 400 };
const MIN_VIEWBOX_DIM = 1;

function sanitizeViewBox(viewBox: MapViewBox): MapViewBox {
  return {
    x: viewBox.x,
    y: viewBox.y,
    width: Math.max(viewBox.width, MIN_VIEWBOX_DIM),
    height: Math.max(viewBox.height, MIN_VIEWBOX_DIM),
  };
}

export function boundsFromNodes(
  nodes: { position?: { x: number; y: number } }[],
  padding = 80,
): MapBounds {
  const positioned = nodes.filter((n) => n.position != null);
  if (!positioned.length) return { ...FALLBACK_BOUNDS };

  const xs = positioned.map((n) => n.position!.x);
  const ys = positioned.map((n) => n.position!.y);
  const minX = Math.min(...xs) - padding;
  const minY = Math.min(...ys) - padding;
  const maxX = Math.max(...xs) + padding;
  const maxY = Math.max(...ys) + padding;

  return {
    minX,
    minY,
    maxX: maxX <= minX ? minX + FALLBACK_BOUNDS.maxX : maxX,
    maxY: maxY <= minY ? minY + FALLBACK_BOUNDS.maxY : maxY,
  };
}

export function boundsToViewBox(bounds: MapBounds): MapViewBox {
  const width = Math.max(bounds.maxX - bounds.minX, MIN_VIEWBOX_DIM);
  const height = Math.max(bounds.maxY - bounds.minY, MIN_VIEWBOX_DIM);
  return { x: bounds.minX, y: bounds.minY, width, height };
}

export function fitBoundsToViewport(bounds: MapBounds, viewport: ViewportSize): MapViewBox {
  const boundsVb = boundsToViewBox(bounds);
  if (!viewport.width || !viewport.height || viewport.width <= 0 || viewport.height <= 0) {
    return boundsVb;
  }

  const boundsAspect = boundsVb.width / boundsVb.height;
  const viewportAspect = viewport.width / viewport.height;

  let width = boundsVb.width;
  let height = boundsVb.height;

  if (boundsAspect > viewportAspect) {
    height = width / viewportAspect;
  } else {
    width = height * viewportAspect;
  }

  return sanitizeViewBox({
    x: boundsVb.x + (boundsVb.width - width) / 2,
    y: boundsVb.y + (boundsVb.height - height) / 2,
    width,
    height,
  });
}

export function viewBoxToString(viewBox: MapViewBox): string {
  const round = (n: number) => Math.round(n * 100) / 100;
  return `${round(viewBox.x)} ${round(viewBox.y)} ${round(viewBox.width)} ${round(viewBox.height)}`;
}

export function getViewBoxScale(base: MapViewBox, current: MapViewBox): number {
  if (!base.width || !current.width || base.width <= 0 || current.width <= 0) return 1;
  return base.width / current.width;
}

export function zoomViewBoxAtPoint(params: {
  current: MapViewBox;
  base: MapViewBox;
  pointer: { x: number; y: number };
  zoomFactor: number;
  minScale?: number;
  maxScale?: number;
}): MapViewBox {
  const { current, base, pointer, zoomFactor } = params;
  const minScale = params.minScale ?? 0.5;
  const maxScale = params.maxScale ?? 6;

  const currentScale = getViewBoxScale(base, current);
  const targetScale = Math.min(maxScale, Math.max(minScale, currentScale * zoomFactor));
  const actualFactor = targetScale / currentScale;
  if (!Number.isFinite(actualFactor) || actualFactor === 0) return current;

  const newWidth = current.width / actualFactor;
  const newHeight = current.height / actualFactor;
  const newX = pointer.x - (pointer.x - current.x) / actualFactor;
  const newY = pointer.y - (pointer.y - current.y) / actualFactor;

  return sanitizeViewBox({ x: newX, y: newY, width: newWidth, height: newHeight });
}

export function panViewBox(current: MapViewBox, dx: number, dy: number): MapViewBox {
  return sanitizeViewBox({
    x: current.x - dx,
    y: current.y - dy,
    width: current.width,
    height: current.height,
  });
}

export function focusPointViewBox(
  point: { x: number; y: number },
  base: MapViewBox,
  viewport: ViewportSize,
  zoomScale = 2,
): MapViewBox {
  const fitted = fitBoundsToViewport(
    { minX: base.x, minY: base.y, maxX: base.x + base.width, maxY: base.y + base.height },
    viewport,
  );
  const scale = Math.max(zoomScale, 0.1);
  let width = fitted.width / scale;
  let height = fitted.height / scale;

  if (viewport.width > 0 && viewport.height > 0) {
    const aspect = viewport.width / viewport.height;
    if (width / height > aspect) {
      height = width / aspect;
    } else {
      width = height * aspect;
    }
  }

  return sanitizeViewBox({
    x: point.x - width / 2,
    y: point.y - height / 2,
    width,
    height,
  });
}

export function clientPointToSvgPoint(
  clientX: number,
  clientY: number,
  svgRect: DOMRect,
  viewBox: MapViewBox,
): { x: number; y: number } {
  if (!svgRect.width || !svgRect.height) {
    return { x: viewBox.x + viewBox.width / 2, y: viewBox.y + viewBox.height / 2 };
  }
  const relX = (clientX - svgRect.left) / svgRect.width;
  const relY = (clientY - svgRect.top) / svgRect.height;
  return {
    x: viewBox.x + relX * viewBox.width,
    y: viewBox.y + relY * viewBox.height,
  };
}

export function getAssetFocusViewBox(
  assetPosition: { x: number; y: number },
  base: MapViewBox,
  viewport: ViewportSize,
): MapViewBox {
  return focusPointViewBox(assetPosition, base, viewport, 2.2);
}

export function getRootFocusViewBox(
  assetPosition: { x: number; y: number },
  base: MapViewBox,
  viewport: ViewportSize,
): MapViewBox {
  return focusPointViewBox(assetPosition, base, viewport, 1.8);
}

export function getViewportTransform(base: MapViewBox, current: MapViewBox): ViewportTransform {
  const scale = getViewBoxScale(base, current);
  return {
    viewBox: current,
    scale,
    zoomBand: getZoomBandFromScale(scale),
  };
}