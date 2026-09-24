/**
 * <ComponentModel kind status selected running /> — one piece of equipment, usable standalone
 * (inside any R3F <Canvas>) or in the plant scene. Uses a real CAD model when
 * public/models/manifest.json lists one for the asset id / model name / kind, otherwise the
 * parametric model. Adds the steady status/selection overlay.
 */
import { Component, createContext, lazy, Suspense, useContext, type ReactNode } from "react";
import type { AssetStatus } from "../../maps2d/mapTypes";
import { resolveGlb, useGlbManifest } from "../lib/glbManifest";
import { footprintFor, type ModelKind } from "../lib/registry";
import { statusPresentation } from "../lib/status";
import { readSceneTheme, type SceneTheme } from "../lib/theme";
import { MODEL_COMPONENTS } from "./library";
import { StatusFrame } from "./StatusFrame";

const GlbModel = lazy(() => import("./GlbModel"));

export const SceneThemeContext = createContext<SceneTheme | null>(null);

class GlbBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("[plant3d] GLB model failed to load; using the parametric model instead.", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export interface ComponentModelProps {
  kind: ModelKind;
  status?: AssetStatus | string;
  selected?: boolean;
  hovered?: boolean;
  running?: boolean;
  /** Equipment tag for tag plates (e.g. "MTR-301"). */
  label?: string;
  /** Asset id and coords_3d.model name — used to find a GLB override. */
  assetId?: string;
  modelKey?: string;
  /** Uniform scale on top of the kind's default size. */
  scale?: number;
  /** Draw the status / selection overlay (default true). */
  frame?: boolean;
}

export function ComponentModel({
  kind,
  status = "normal",
  selected = false,
  hovered = false,
  running = false,
  label,
  assetId,
  modelKey,
  scale = 1,
  frame = true,
}: ComponentModelProps) {
  const theme = useContext(SceneThemeContext) ?? readSceneTheme();
  const presentation = statusPresentation(status);
  const statusColor = presentation.outline ? theme.status[presentation.outline] : null;
  const footprint = footprintFor(kind, scale);
  const manifest = useGlbManifest();
  const glb = resolveGlb(manifest, [assetId, modelKey, kind]);
  const Parametric = MODEL_COMPONENTS[kind];
  const parametric = (
    <group scale={scale}>
      <Parametric running={running} ledColor={statusColor} {...(label ? { label } : {})} />
    </group>
  );
  return (
    <group>
      {glb ? (
        <GlbBoundary key={glb.url} fallback={parametric}>
          <Suspense fallback={parametric}>
            <GlbModel url={glb.url} entry={glb.entry} footprint={footprint} />
          </Suspense>
        </GlbBoundary>
      ) : (
        parametric
      )}
      {frame ? <StatusFrame footprint={footprint} statusColor={statusColor} accent={theme.accent} selected={selected} hovered={hovered} /> : null}
    </group>
  );
}
