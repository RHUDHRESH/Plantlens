/** Reads design tokens from CSS variables — 3D scene uses the same palette as 2D. */

function readCssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function getMapTheme() {
  return {
    canvas: readCssVar("--map-ground", "#EDE8DC"),
    zoneStroke: readCssVar("--map-zone-stroke", "#B8AE97"),
    assetStroke: readCssVar("--map-asset-stroke", "#585C55"),
    edge: readCssVar("--map-edge", "#B8AE97"),
    edgeHighlight: readCssVar("--map-edge-highlight", "#0F4C46"),
    accent: readCssVar("--accent", "#0F4C46"),
    ink500: readCssVar("--ink-500", "#585C55"),
    ink700: readCssVar("--ink-700", "#3E443D"),
    surface: readCssVar("--surface", "#F5F1E7"),
    healthy: readCssVar("--healthy", "#37563A"),
    advisory: readCssVar("--advisory", "#8A5E0E"),
    warning: readCssVar("--warning", "#9C6B12"),
    critical: readCssVar("--critical", "#A32B1E"),
    ink300: readCssVar("--ink-300", "#8C8878"),
  };
}