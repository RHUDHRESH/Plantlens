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

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Pan (never zoom) `view` so that `target` (content coords) lands inside `clear` (client px),
 * e.g. the part of the canvas not covered by a side sheet. Returns null when already visible.
 * `svg` is the SVG's client rect; the SVG uses preserveAspectRatio="xMidYMid meet".
 */
export function revealBox(view: Box, target: Box, svg: ScreenRect, clear: ScreenRect, pad = 24): Box | null {
  const rw = svg.right - svg.left;
  const rh = svg.bottom - svg.top;
  if (rw <= 0 || rh <= 0) return null;
  const s = Math.min(rw / view.w, rh / view.h);
  const ox = svg.left + (rw - view.w * s) / 2;
  const oy = svg.top + (rh - view.h * s) / 2;
  const axis = (start: number, size: number, lo: number, hi: number) => {
    const end = start + size;
    if (hi - lo < size) return (lo + hi) / 2 - (start + end) / 2;
    if (start < lo) return lo - start;
    if (end > hi) return hi - end;
    return 0;
  };
  const dx = axis(ox + (target.x - view.x) * s, target.w * s, Math.max(svg.left, clear.left) + pad, Math.min(svg.right, clear.right) - pad);
  const dy = axis(oy + (target.y - view.y) * s, target.h * s, Math.max(svg.top, clear.top) + pad, Math.min(svg.bottom, clear.bottom) - pad);
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return null;
  return { ...view, x: view.x - dx / s, y: view.y - dy / s };
}

function prefersReducedMotion() {
  try {
    return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function usePanZoom(bounds: Box) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState<Box>(bounds);
  const baseRef = useRef(bounds);
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const key = `${bounds.x}|${bounds.y}|${bounds.w}|${bounds.h}`;
  const viewRef = useRef(view);
  viewRef.current = view;
  const animRef = useRef<number | null>(null);
  const stopAnim = useCallback(() => {
    if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    animRef.current = null;
  }, []);
  useEffect(() => stopAnim, [stopAnim]);

  /** Glide to `target` (300 ms ease-out; instant with reduced motion). */
  const animateTo = useCallback(
    (target: Box, ms = 300) => {
      stopAnim();
      if (ms <= 0 || prefersReducedMotion() || typeof requestAnimationFrame === "undefined") {
        setView(target);
        return;
      }
      const from = viewRef.current;
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, Math.max(0, (now - t0) / ms));
        const k = 1 - (1 - t) ** 3;
        setView({
          x: from.x + (target.x - from.x) * k,
          y: from.y + (target.y - from.y) * k,
          w: from.w + (target.w - from.w) * k,
          h: from.h + (target.h - from.h) * k,
        });
        animRef.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      animRef.current = requestAnimationFrame(step);
    },
    [stopAnim],
  );

  /** Pan so `target` sits inside the unobstructed client rect `clear` (e.g. left of a side sheet). */
  const reveal = useCallback(
    (target: Box, clear: Partial<ScreenRect>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      const next = revealBox(viewRef.current, target, r, {
        left: clear.left ?? r.left,
        top: clear.top ?? r.top,
        right: clear.right ?? r.right,
        bottom: clear.bottom ?? r.bottom,
      });
      if (next) animateTo(next);
    },
    [animateTo],
  );

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
      stopAnim();
      const factor = Math.exp(-e.deltaY * 0.0015);
      setView((v) => {
        const p = toContent(e.clientX, e.clientY, v);
        return zoomBoxAt(v, factor, p.x, p.y, baseRef.current);
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [toContent, stopAnim]);

  const onPointerDown = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    if ((e.target as Element).closest("[data-interactive]")) return;
    stopAnim();
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, [stopAnim]);

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
    reveal,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onKeyDown },
  };
}
