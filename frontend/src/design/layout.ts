/**
 * Layout constants for the app shell — map-first, panel overlays.
 */

export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

export const zIndex = {
  map: 0,
  mapOverlay: 10,
  bottomSheet: 40,
  leftRail: 50,
  rightPanel: 50,
  topBar: 60,
  mobileNav: 70,
  copilot: 80,
  toast: 90,
  modal: 100,
} as const;

export const shell = {
  topBarHeight: "3.5rem",
  leftRailWidth: "18rem",
  rightPanelWidth: "22rem",
  mobileNavHeight: "3.75rem",
  sheetHandleHeight: "3rem",
  mapPadding: "0",
} as const;

export const grid = {
  contentMaxWidth: "80rem",
  gutter: "1rem",
  gutterLg: "1.5rem",
} as const;

export function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < breakpoints.lg;
}