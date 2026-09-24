/**
 * Scene theme read from the design tokens (CSS variables) at runtime so the 3D view follows the
 * light/dark theme exactly like the 2D surfaces. Re-read when `data-theme` changes.
 */
import { useEffect, useState } from "react";

export interface SceneTheme {
  isDark: boolean;
  background: string;
  floor: string;
  grid: string;
  gridStrong: string;
  text: string;
  textMuted: string;
  accent: string;
  status: { critical: string; warning: string; sensor_bad: string; offline: string };
  medium: { power: string; signal: string; fluid: string; air: string; mechanical: string; causal: string };
}

const LIGHT_FALLBACK: SceneTheme = {
  isDark: false,
  background: "#F4F4F2",
  floor: "#ECECE9",
  grid: "#E4E4DF",
  gridStrong: "#C9C9C3",
  text: "#1A1A1E",
  textMuted: "#5E5E5A",
  accent: "#2457D6",
  status: { critical: "#C0261D", warning: "#A77F00", sensor_bad: "#6B5DD3", offline: "#8A8A84" },
  medium: {
    power: "#9C5B3B",
    signal: "#3D7A5A",
    fluid: "#2F6F8F",
    air: "#5F8A9A",
    mechanical: "#5E5E5A",
    causal: "#2457D6",
  },
};

export function readCssVar(styles: CSSStyleDeclaration | null, name: string, fallback: string): string {
  const v = styles?.getPropertyValue(name).trim();
  return v ? v : fallback;
}

export function readSceneTheme(root: HTMLElement | null = typeof document !== "undefined" ? document.documentElement : null): SceneTheme {
  if (!root || typeof getComputedStyle !== "function") return LIGHT_FALLBACK;
  const s = getComputedStyle(root);
  const f = LIGHT_FALLBACK;
  const isDark = root.getAttribute("data-theme") === "dark";
  return {
    isDark,
    background: readCssVar(s, "--canvas", f.background),
    floor: readCssVar(s, "--surface-sunken", f.floor),
    grid: readCssVar(s, "--grid", f.grid),
    gridStrong: readCssVar(s, "--border-strong", f.gridStrong),
    text: readCssVar(s, "--text", f.text),
    textMuted: readCssVar(s, "--text-muted", f.textMuted),
    accent: readCssVar(s, "--accent", f.accent),
    status: {
      critical: readCssVar(s, "--status-critical", f.status.critical),
      warning: readCssVar(s, "--status-medium", f.status.warning),
      sensor_bad: readCssVar(s, "--status-sensor-bad", f.status.sensor_bad),
      offline: readCssVar(s, "--status-offline", f.status.offline),
    },
    medium: {
      power: readCssVar(s, "--medium-dc-power", f.medium.power),
      signal: readCssVar(s, "--medium-signal", f.medium.signal),
      fluid: readCssVar(s, "--medium-fluid", f.medium.fluid),
      air: readCssVar(s, "--medium-air", f.medium.air),
      mechanical: readCssVar(s, "--medium-mechanical", f.medium.mechanical),
      causal: readCssVar(s, "--accent", f.medium.causal),
    },
  };
}

/** Current scene theme; re-reads tokens whenever <html data-theme|class|style> changes. */
export function useSceneTheme(): SceneTheme {
  const [theme, setTheme] = useState<SceneTheme>(() => readSceneTheme());
  useEffect(() => {
    if (typeof MutationObserver === "undefined" || typeof document === "undefined") return;
    const root = document.documentElement;
    const observer = new MutationObserver(() => setTheme(readSceneTheme(root)));
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
    setTheme(readSceneTheme(root));
    return () => observer.disconnect();
  }, []);
  return theme;
}
