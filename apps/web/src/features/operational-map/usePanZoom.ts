/**
 * Minimal SVG pan/zoom via viewBox (no transforms on nodes, so hit targets stay crisp and the
 * frame budget stays well under 16 ms). Wheel = zoom at pointer, drag on background = pan,
 * keyboard: + / − / 0 on the focused canvas and arrow keys to pan.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MIN_SCALE = 0.35;
export const MAX_SCALE = 4;

export function padBox(b: Box, pad: number): Box {
  return { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
}

/** Zoom a view box by `factor` (>1 zooms in) around a point in content coordinates. */
export function zoomBoxAt(view: Box, factor: number, cx: number, cy: number, base: Box): Box {
  const scale = base.w / view.w;
  const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
  const f = scale / nextScale;
  const w = view.w * f;
  const h = view.h * f;
  return { x: cx - (cx - view.x) * f, y: cy - (cy - view.y) * f, w, h };
}

export function usePanZoom(bounds: Box) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState<Box>(bounds);
  const baseRef = useRef(bounds);
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const key = `${bounds.x}|${bounds.y}|${bounds.w}|${bounds.h}`;

  useEffect(() => {
    baseRef.current = bounds;
    setView(bounds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const toContent = useCallback((clientX: number, clientY: number, v: Box) => {
    const svg = svgRef.current;
    const rect = svg?.getBoundingClientRect();
    if (!svg || !rect || rect.width === 0) return { x: v.x + v.w / 2, y: v.y + v.h / 2 };
    // preserveAspectRatio="xMidYMid meet": uniform scale, centred.
    const s = Math.min(rect.width / v.w, rect.height / v.h);
    const ox = (rect.width - v.w * s) / 2;
    const oy = (rect.height - v.h * s) / 2;
    return { x: v.x + (clientX - rect.left - ox) / s, y: v.y + (clientY - rect.top - oy) / s };
  }, []);

  const zoomBy = useCallback((factor: number) => {
    setView((v) => zoomBoxAt(v, factor, v.x + v.w / 2, v.y + v.h / 2, baseRef.current));
  }, []);
  const fit = useCallback(() => setView(baseRef.current), []);
  const panBy = useCallback((dxFrac: number, dyFrac: number) => {
    setView((v) => ({ ...v, x: v.x + v.w * dxFrac, y: v.y + v.h * dyFrac }));
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0015);
      setView((v) => {
        const p = toContent(e.clientX, e.clientY, v);
        return zoomBoxAt(v, factor, p.x, p.y, baseRef.current);
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [toContent]);

  const onPointerDown = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    if ((e.target as Element).closest("[data-interactive]")) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
    d.x = e.clientX;
    d.y = e.clientY;
    setView((v) => {
      const s = Math.min(rect.width / v.w, rect.height / v.h) || 1;
      return { ...v, x: v.x - dx / s, y: v.y - dy / s };
    });
  }, []);

  const onPointerUp = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  }, []);

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<SVGSVGElement>) => {
      if (e.target !== e.currentTarget) return;
      const map: Record<string, () => void> = {
        "+": () => zoomBy(1.25),
        "=": () => zoomBy(1.25),
        "-": () => zoomBy(0.8),
        "0": fit,
        ArrowLeft: () => panBy(-0.1, 0),
        ArrowRight: () => panBy(0.1, 0),
        ArrowUp: () => panBy(0, -0.1),
        ArrowDown: () => panBy(0, 0.1),
      };
      const fn = map[e.key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    },
    [fit, panBy, zoomBy],
  );

  const scale = baseRef.current.w / view.w;
  return {
    svgRef,
    viewBox: `${view.x} ${view.y} ${view.w} ${view.h}`,
    scale,
    zoomIn: () => zoomBy(1.25),
    zoomOut: () => zoomBy(0.8),
    fit,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onKeyDown },
  };
}
