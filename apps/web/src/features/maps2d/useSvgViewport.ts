import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapZoomBand } from "../operational-map";
import {
  boundsFromNodes,
  boundsToViewBox,
  clientPointToSvgPoint,
  fitBoundsToViewport,
  getAssetFocusViewBox,
  getRootFocusViewBox,
  getViewportTransform,
  panViewBox,
  viewBoxToString,
  zoomViewBoxAtPoint,
} from "../operational-map/viewportMath";
import type { MapViewBox } from "../operational-map/viewportTypes";
import type { MapNode } from "./mapTypes";

const DEFAULT_VIEWPORT = { width: 800, height: 400 };
const ZOOM_IN_FACTOR = 1.2;
const ZOOM_OUT_FACTOR = 1 / ZOOM_IN_FACTOR;
const WHEEL_ZOOM_SENSITIVITY = 0.001;

export interface UseSvgViewportOptions {
  nodes: MapNode[];
  focusAssetId?: string | null;
  rootAssetId?: string | null;
  reducedMotion?: boolean;
  onZoomBandChange?: (band: MapZoomBand) => void;
}

function isInteractiveNodeTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  return Boolean(target.closest('[role="button"]'));
}

function readViewportSize(svg: SVGSVGElement | null): { width: number; height: number } {
  if (!svg) return DEFAULT_VIEWPORT;
  const rect = svg.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return { width: rect.width, height: rect.height };
  }
  return DEFAULT_VIEWPORT;
}

export function useSvgViewport({
  nodes,
  focusAssetId,
  rootAssetId,
  onZoomBandChange,
}: UseSvgViewportOptions) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [baseViewBox, setBaseViewBox] = useState<MapViewBox>(() =>
    boundsToViewBox(boundsFromNodes(nodes)),
  );
  const [currentViewBox, setCurrentViewBox] = useState<MapViewBox>(baseViewBox);
  const [viewportSize, setViewportSize] = useState(DEFAULT_VIEWPORT);
  const [isPanning, setIsPanning] = useState(false);
  const lastPanPoint = useRef<{ x: number; y: number } | null>(null);
  const prevFocusAssetId = useRef<string | null | undefined>(undefined);
  const nodesSignature = useMemo(
    () =>
      nodes
        .map((n) => `${n.id}:${n.position?.x ?? ""}:${n.position?.y ?? ""}`)
        .join("|"),
    [nodes],
  );

  const applyViewBox = useCallback(
    (next: MapViewBox) => {
      setCurrentViewBox(next);
      const { zoomBand } = getViewportTransform(baseViewBox, next);
      onZoomBandChange?.(zoomBand);
    },
    [baseViewBox, onZoomBandChange],
  );

  const fitPlant = useCallback(() => {
    const bounds = boundsFromNodes(nodes);
    const base = boundsToViewBox(bounds);
    setBaseViewBox(base);
    const fitted = fitBoundsToViewport(bounds, viewportSize);
    applyViewBox(fitted);
  }, [nodes, viewportSize, applyViewBox]);

  const focusAsset = useCallback(
    (assetId: string) => {
      const node = nodes.find((n) => n.id === assetId);
      if (!node?.position) return;
      const next = getAssetFocusViewBox(node.position, baseViewBox, viewportSize);
      applyViewBox(next);
    },
    [nodes, baseViewBox, viewportSize, applyViewBox],
  );

  const focusRoot = useCallback(() => {
    if (!rootAssetId) return;
    const node = nodes.find((n) => n.id === rootAssetId);
    if (!node?.position) return;
    const next = getRootFocusViewBox(node.position, baseViewBox, viewportSize);
    applyViewBox(next);
  }, [nodes, rootAssetId, baseViewBox, viewportSize, applyViewBox]);

  const zoomAtCenter = useCallback(
    (zoomFactor: number) => {
      const center = {
        x: currentViewBox.x + currentViewBox.width / 2,
        y: currentViewBox.y + currentViewBox.height / 2,
      };
      const next = zoomViewBoxAtPoint({
        current: currentViewBox,
        base: baseViewBox,
        pointer: center,
        zoomFactor,
      });
      applyViewBox(next);
    },
    [currentViewBox, baseViewBox, applyViewBox],
  );

  const zoomIn = useCallback(() => zoomAtCenter(ZOOM_IN_FACTOR), [zoomAtCenter]);
  const zoomOut = useCallback(() => zoomAtCenter(ZOOM_OUT_FACTOR), [zoomAtCenter]);

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || isInteractiveNodeTarget(e.target)) return;
    const svg = svgRef.current;
    if (!svg) return;
    svg.setPointerCapture(e.pointerId);
    setIsPanning(true);
    lastPanPoint.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!isPanning || !lastPanPoint.current || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dx = ((e.clientX - lastPanPoint.current.x) / rect.width) * currentViewBox.width;
      const dy = ((e.clientY - lastPanPoint.current.y) / rect.height) * currentViewBox.height;
      lastPanPoint.current = { x: e.clientX, y: e.clientY };
      applyViewBox(panViewBox(currentViewBox, dx, dy));
    },
    [isPanning, currentViewBox, applyViewBox],
  );

  const endPan = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (svgRef.current?.hasPointerCapture(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId);
    }
    setIsPanning(false);
    lastPanPoint.current = null;
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const pointer = clientPointToSvgPoint(e.clientX, e.clientY, rect, currentViewBox);
      const zoomFactor = Math.exp(-e.deltaY * WHEEL_ZOOM_SENSITIVITY);
      const next = zoomViewBoxAtPoint({
        current: currentViewBox,
        base: baseViewBox,
        pointer,
        zoomFactor,
      });
      applyViewBox(next);
    },
    [currentViewBox, baseViewBox, applyViewBox],
  );

  useEffect(() => {
    const bounds = boundsFromNodes(nodes);
    const base = boundsToViewBox(bounds);
    const fitted = fitBoundsToViewport(bounds, viewportSize);
    setBaseViewBox(base);
    setCurrentViewBox(fitted);
    const { zoomBand } = getViewportTransform(base, fitted);
    onZoomBandChange?.(zoomBand);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset viewport when node layout changes
  }, [nodesSignature]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const updateSize = () => setViewportSize(readViewportSize(svg));
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [nodes.length]);

  useEffect(() => {
    if (focusAssetId === prevFocusAssetId.current) return;
    prevFocusAssetId.current = focusAssetId;
    if (focusAssetId) focusAsset(focusAssetId);
  }, [focusAssetId, focusAsset]);

  const { scale, zoomBand } = useMemo(
    () => getViewportTransform(baseViewBox, currentViewBox),
    [baseViewBox, currentViewBox],
  );

  const viewBoxString = useMemo(() => viewBoxToString(currentViewBox), [currentViewBox]);

  return {
    svgRef,
    viewBox: currentViewBox,
    viewBoxString,
    scale,
    zoomBand,
    isPanning,
    fitPlant,
    focusAsset,
    focusRoot,
    zoomIn,
    zoomOut,
    onPointerDown,
    onPointerMove,
    onPointerUp: endPan,
    onPointerLeave: endPan,
    onWheel,
  };
}