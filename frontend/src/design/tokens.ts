/**
 * Design tokens — Uber-inspired industrial palette.
 * CSS variables in index.css mirror these values for runtime theming.
 */

export const colors = {
  chrome: {
    dark: "#0a0a0a",
    charcoal: "#141414",
    elevated: "#1c1c1e",
    border: "rgba(255, 255, 255, 0.08)",
    borderStrong: "rgba(255, 255, 255, 0.16)",
  },
  surface: {
    white: "#ffffff",
    light: "#f5f5f5",
    muted: "#e8e8e8",
    dark: "#1c1c1e",
    overlay: "rgba(0, 0, 0, 0.6)",
  },
  map: {
    canvas: "#2a2a2e",
    grid: "rgba(255, 255, 255, 0.04)",
  },
  text: {
    primary: "#ffffff",
    secondary: "rgba(255, 255, 255, 0.72)",
    muted: "rgba(255, 255, 255, 0.48)",
    inverse: "#0a0a0a",
    label: "rgba(255, 255, 255, 0.56)",
  },
  semantic: {
    normal: "#6b7280",
    healthy: "#4ade80",
    warning: "#f59e0b",
    danger: "#dc2626",
    info: "#60a5fa",
    degraded: "#d97706",
  },
  focus: {
    ring: "rgba(96, 165, 250, 0.6)",
  },
} as const;

export const typography = {
  fontFamily: {
    sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    mono: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
  },
  fontSize: {
    label: "0.6875rem",
    caption: "0.75rem",
    body: "0.875rem",
    bodyLg: "1rem",
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
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.625,
  },
} as const;

export const spacing = {
  0: "0",
  1: "0.25rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  8: "2rem",
  10: "2.5rem",
  12: "3rem",
  16: "4rem",
} as const;

export const radius = {
  sm: "0.375rem",
  md: "0.5rem",
  lg: "0.75rem",
  xl: "1rem",
  sheet: "1.25rem",
  full: "9999px",
} as const;

export const shadow = {
  sm: "0 1px 2px rgba(0, 0, 0, 0.24)",
  md: "0 4px 12px rgba(0, 0, 0, 0.32)",
  lg: "0 8px 32px rgba(0, 0, 0, 0.48)",
  sheet: "0 -4px 24px rgba(0, 0, 0, 0.4)",
} as const;

export const touch = {
  minTarget: "44px",
} as const;