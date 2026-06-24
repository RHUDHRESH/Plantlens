/**
 * Motion tokens — smooth, calm transitions. Respects prefers-reduced-motion via CSS.
 */

export const duration = {
  instant: 100,
  fast: 150,
  normal: 250,
  slow: 350,
  sheet: 400,
} as const;

export const easing = {
  default: "cubic-bezier(0.4, 0, 0.2, 1)",
  enter: "cubic-bezier(0, 0, 0.2, 1)",
  exit: "cubic-bezier(0.4, 0, 1, 1)",
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
} as const;

export const transition = {
  fade: `opacity ${duration.normal}ms ${easing.default}`,
  slide: `transform ${duration.normal}ms ${easing.enter}`,
  sheet: `transform ${duration.sheet}ms ${easing.enter}`,
  panel: `transform ${duration.slow}ms ${easing.enter}, opacity ${duration.normal}ms ${easing.default}`,
  role: `opacity ${duration.slow}ms ${easing.default}`,
} as const;

export const sheetHeights = {
  collapsed: 48,
  peek: 180,
  expanded: "min(72vh, 640px)",
} as const;

export const keyframes = {
  pulse: "pl-pulse 2s ease-in-out infinite",
  skeleton: "pl-skeleton 1.5s ease-in-out infinite",
  fadeIn: "pl-fade-in 250ms ease forwards",
  slideUp: "pl-slide-up 400ms cubic-bezier(0, 0, 0.2, 1) forwards",
} as const;

/** Returns a style object that disables animation when reduced motion is preferred. */
export function motionSafe(animation: string): { animation: string } {
  return { animation };
}