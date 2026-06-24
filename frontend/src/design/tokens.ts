/**
 * Design tokens — Uber-inspired industrial palette (Screen 01).
 * CSS variables in index.css mirror these for runtime theming.
 */

export const colors = {
  bgApp: "#050505",
  bgAppAlt: "#0a0a0a",
  bgPanel: "#111111",
  bgPanelElevated: "#181818",
  bgMap: "#e8e5de",
  bgMapAlt: "#d8d6cf",
  textPrimary: "#ffffff",
  textInverse: "#111111",
  textMuted: "#8a8a8a",
  borderSubtle: "rgba(255, 255, 255, 0.10)",
  borderStrong: "rgba(255, 255, 255, 0.16)",
  normal: "#737373",
  warning: "#f59e0b",
  critical: "#ef4444",
  success: "#22c55e",
  unknown: "#525252",
  info: "#60a5fa",
  focusRing: "rgba(96, 165, 250, 0.6)",
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  sheet: 32,
  full: 9999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const shadow = {
  sheet: "0 8px 40px rgba(0, 0, 0, 0.55)",
  panel: "0 2px 12px rgba(0, 0, 0, 0.35)",
} as const;

export const typography = {
  fontFamily: {
    sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    mono: 'ui-monospace, "SF Mono", monospace',
  },
  fontSize: {
    label: "0.6875rem",
    caption: "0.75rem",
    body: "0.875rem",
    heading: "1.25rem",
    headingLg: "1.5rem",
    display: "2rem",
    numeric: "1.75rem",
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  letterSpacing: {
    label: "0.08em",
    tight: "-0.02em",
  },
} as const;

export const touch = {
  minTarget: 44,
} as const;