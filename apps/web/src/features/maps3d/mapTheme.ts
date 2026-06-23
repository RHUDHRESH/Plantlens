/** Reads design tokens from CSS variables — 3D scene uses the same palette as 2D. */

function readCssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function getMapTheme() {
  return {
    canvas: readCssVar("--map-ground", "#F6F7F8"),
    zoneStroke: readCssVar("--map-zone-stroke", "#CDD2D7"),
    assetStroke: readCssVar("--map-asset-stroke", "#687077"),
    edge: readCssVar("--map-edge", "#CDD2D7"),
    edgeHighlight: readCssVar("--map-edge-highlight", "#2563EB"),
    accent: readCssVar("--accent", "#2563EB"),
    ink500: readCssVar("--ink-500", "#687077"),
    ink700: readCssVar("--ink-700", "#3C4248"),
    surface: readCssVar("--surface", "#FFFFFF"),
    healthy: readCssVar("--healthy", "#1F8A4C"),
    advisory: readCssVar("--advisory", "#B45309"),
    warning: readCssVar("--warning", "#C2410C"),
    critical: readCssVar("--critical", "#B42318"),
    ink300: readCssVar("--ink-300", "#A6ADB4"),
  };
}