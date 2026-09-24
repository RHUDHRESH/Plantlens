/**
 * Real CAD model overrides. `public/models/manifest.json` lists the GLB files that exist, so the
 * app never probes for files that aren't there (no 404 noise in an offline control room). The
 * manifest is fetched once per page load; if it is missing or malformed every asset simply uses
 * its parametric model.
 *
 *   { "version": 1, "models": { "induction_motor": { "file": "induction_motor.glb" } } }
 *
 * Keys may be an asset id (MTR-301), a `coords_3d.model` name (motor_simple) or a model kind
 * (induction_motor). Resolution order: asset id → model name → kind.
 */
import { useEffect, useState } from "react";
import type { Footprint } from "./registry";

export interface GlbEntry {
  file: string;
  /** Override the footprint the model is normalised into [w, d, h] metres. */
  footprint?: [number, number, number];
  /** Extra rotation about Y (degrees) applied before normalising, e.g. for Z-forward exports. */
  yaw?: number;
  /** Draco-compressed: decoder must be self-hosted at /models/draco/ (see README). */
  draco?: boolean;
  source?: string;
  license?: string;
}

export interface GlbManifest {
  version: 1;
  models: Record<string, GlbEntry>;
}

export const EMPTY_MANIFEST: GlbManifest = { version: 1, models: {} };

const SAFE_FILE = /^[A-Za-z0-9._\-/]+\.(glb|gltf)$/;

export function parseManifest(raw: unknown): GlbManifest {
  if (!raw || typeof raw !== "object") return EMPTY_MANIFEST;
  const models = (raw as { models?: unknown }).models;
  if (!models || typeof models !== "object") return EMPTY_MANIFEST;
  const out: Record<string, GlbEntry> = {};
  for (const [key, value] of Object.entries(models as Record<string, unknown>)) {
    const entry = typeof value === "string" ? { file: value } : (value as Partial<GlbEntry> | null);
    if (!entry || typeof entry.file !== "string" || !SAFE_FILE.test(entry.file) || entry.file.includes("..")) continue;
    const clean: GlbEntry = { file: entry.file };
    if (
      Array.isArray(entry.footprint) &&
      entry.footprint.length === 3 &&
      entry.footprint.every((n) => typeof n === "number" && n > 0)
    ) {
      clean.footprint = entry.footprint as [number, number, number];
    }
    if (typeof entry.yaw === "number" && Number.isFinite(entry.yaw)) clean.yaw = entry.yaw;
    if (entry.draco === true) clean.draco = true;
    if (typeof entry.source === "string") clean.source = entry.source;
    if (typeof entry.license === "string") clean.license = entry.license;
    out[key] = clean;
  }
  return { version: 1, models: out };
}

export interface ResolvedGlb {
  key: string;
  url: string;
  entry: GlbEntry;
}

export function modelsBaseUrl(): string {
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? "/";
  return `${base.endsWith("/") ? base : `${base}/`}models/`;
}

/** First manifest entry matching the candidate keys (asset id, model name, kind), or null. */
export function resolveGlb(
  manifest: GlbManifest,
  candidates: Array<string | null | undefined>,
  baseUrl = modelsBaseUrl(),
): ResolvedGlb | null {
  for (const key of candidates) {
    if (!key) continue;
    const entry = manifest.models[key];
    if (entry) return { key, url: `${baseUrl}${entry.file}`, entry };
  }
  return null;
}

export interface Box3Like {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

/**
 * Uniform scale + offset that fits an imported model's bounding box inside the footprint, centred
 * on X/Z with its lowest point on the floor (y = 0).
 */
export function computeNormalisation(box: Box3Like, footprint: Footprint) {
  const sx = box.max.x - box.min.x;
  const sy = box.max.y - box.min.y;
  const sz = box.max.z - box.min.z;
  const ratios = [footprint.w / sx, footprint.h / sy, footprint.d / sz].filter((r) => Number.isFinite(r) && r > 0);
  const scale = ratios.length ? Math.min(...ratios) : 1;
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  return {
    scale,
    offset: [-cx * scale, -box.min.y * scale, -cz * scale] as [number, number, number],
  };
}

let manifestPromise: Promise<GlbManifest> | null = null;
let manifestValue: GlbManifest | null = null;

export function loadGlbManifest(fetchImpl: typeof fetch | undefined = typeof fetch === "function" ? fetch : undefined): Promise<GlbManifest> {
  if (manifestPromise) return manifestPromise;
  if (!fetchImpl) return Promise.resolve(EMPTY_MANIFEST);
  manifestPromise = fetchImpl(`${modelsBaseUrl()}manifest.json`, { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : EMPTY_MANIFEST))
    .then(parseManifest)
    .catch(() => EMPTY_MANIFEST)
    .then((m) => {
      manifestValue = m;
      return m;
    });
  return manifestPromise;
}

/** Test hook. */
export function resetGlbManifestCache() {
  manifestPromise = null;
  manifestValue = null;
}

export function useGlbManifest(): GlbManifest {
  const [manifest, setManifest] = useState<GlbManifest>(manifestValue ?? EMPTY_MANIFEST);
  useEffect(() => {
    let alive = true;
    void loadGlbManifest().then((m) => {
      if (alive) setManifest(m);
    });
    return () => {
      alive = false;
    };
  }, []);
  return manifest;
}
