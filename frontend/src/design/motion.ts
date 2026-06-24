/**
 * Motion tokens — calm transitions. Respects prefers-reduced-motion via CSS.
 */

export const durationFast = 120;
export const durationNormal = 220;
export const durationSlow = 360;
export const durationSheet = 400;

export const easeOut = "cubic-bezier(0.16, 1, 0.3, 1)";
export const easeDefault = "cubic-bezier(0.4, 0, 0.2, 1)";
export const sheetSpring = "cubic-bezier(0.2, 0.8, 0.2, 1)";

export const transition = {
  fade: `opacity ${durationNormal}ms ${easeDefault}`,
  slide: `transform ${durationNormal}ms ${easeOut}`,
  sheet: `transform ${durationSheet}ms ${sheetSpring}, height ${durationSheet}ms ${sheetSpring}`,
  panel: `transform ${durationSlow}ms ${easeOut}, opacity ${durationNormal}ms ${easeDefault}`,
} as const;

export const sheetHeights = {
  collapsed: 48,
  peek: 220,
  expanded: "min(72vh, 640px)",
} as const;