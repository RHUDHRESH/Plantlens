/**
 * Load-on-open + debounced autosave of the Studio documents:
 *   assembly → PUT /api/studio/assembly/{plant}   (forms-backed source of truth)
 *   layout   → PUT /api/studio/layout/{plant}     (positions + viewport; projection)
 * Both carry base_revision; a 409 pauses autosave and shows Reload / Overwrite.
 */
import { useEffect, useRef } from "react";
import { create } from "zustand";
import { apiFetch } from "../../api/client";
import { ApiError } from "../../api/types";
import { getStudioLayout, putStudioLayout, type StudioLayout } from "../../api/v2";
import { plantAssemblySchema, type PlantAssembly } from "../../app/schemas/plantAssembly";
import { useRulesStore } from "../connection-rules/rulesStore";
import { emptyAssembly } from "./model/assemblyOps";
import { useStudioStore } from "./studioStore";

export const AUTOSAVE_MS = 600;

export interface AssemblyDoc {
  plant_id: string;
  revision: number;
  assembly: PlantAssembly | null;
}

export const getStudioAssembly = (plantId: string, signal?: AbortSignal) =>
  apiFetch<AssemblyDoc>(`/api/studio/assembly/${encodeURIComponent(plantId)}`, { signal });

export const putStudioAssembly = (plantId: string, assembly: PlantAssembly, baseRevision?: number) =>
  apiFetch<AssemblyDoc>(`/api/studio/assembly/${encodeURIComponent(plantId)}`, {
    method: "PUT",
    body: baseRevision === undefined ? { assembly } : { assembly, base_revision: baseRevision },
  });

export type SaveStatus = "loading" | "saved" | "dirty" | "saving" | "error" | "conflict" | "readonly";
type Doc = "assembly" | "layout";

interface PersistState {
  status: SaveStatus;
  assemblyRevision: number;
  layoutRevision: number;
  conflict: { doc: Doc; currentRevision: number | null } | null;
  error: { message: string; fix?: string | undefined } | null;
  lastSavedAt: number | null;
  viewport: StudioLayout["viewport"];
  loaded: boolean;
  /** Set when the stored document could not be read: autosave stays off until Overwrite/Reload. */
  blocked: string | null;
}

export const usePersistStore = create<PersistState>(() => ({
  status: "loading",
  assemblyRevision: 0,
  layoutRevision: 0,
  conflict: null,
  error: null,
  lastSavedAt: null,
  viewport: null,
  loaded: false,
  blocked: null,
}));

type Positions = Record<string, { x: number; y: number }>;

let lastSavedAssembly: PlantAssembly | null = null;
let lastSavedPositions = "";
let lastSavedViewport = "";
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<void> | null = null;

/** `position_3d` may come back as null from older rows; the contract wants it absent. */
export function withoutNulls(value: unknown): unknown {
  if (!value || typeof value !== "object" || !Array.isArray((value as { assets?: unknown }).assets)) return value;
  const doc = value as { assets: Record<string, unknown>[] };
  return {
    ...doc,
    assets: doc.assets.map((a) => {
      if (a && typeof a === "object" && a.position_3d === null) {
        const { position_3d: _drop, ...rest } = a;
        return rest;
      }
      return a;
    }),
  };
}

const positionsOf = (a: PlantAssembly): Positions =>
  Object.fromEntries(a.assets.map((x) => [x.asset_id, { x: x.position_2d.x, y: x.position_2d.y }]));

function applyLayout(assembly: PlantAssembly, positions: Positions): PlantAssembly {
  if (!Object.keys(positions).length) return assembly;
  return {
    ...assembly,
    assets: assembly.assets.map((a) => {
      const p = positions[a.asset_id];
      return p ? { ...a, position_2d: { x: p.x, y: p.y } } : a;
    }),
  };
}

function errorOf(err: unknown) {
  if (err instanceof ApiError) return { message: err.body.message, fix: err.body.fix };
  return { message: err instanceof Error ? err.message : "Save failed" };
}

export async function loadStudio(plantId: string): Promise<void> {
  usePersistStore.setState({ status: "loading", conflict: null, error: null });
  try {
    const [doc, layout] = await Promise.all([getStudioAssembly(plantId), getStudioLayout(plantId)]);
    let assembly = emptyAssembly(plantId);
    let blocked: string | null = null;
    if (doc.assembly) {
      const parsed = plantAssemblySchema.safeParse(withoutNulls(doc.assembly));
      if (parsed.success) assembly = parsed.data;
      // Never autosave an empty canvas over a document we failed to read.
      else blocked = `The saved assembly (revision ${doc.revision}) could not be read: ${parsed.error.issues[0]?.path.join(".") ?? ""} ${parsed.error.issues[0]?.message ?? ""}`.trim();
    }
    assembly = applyLayout(assembly, layout.positions);
    lastSavedAssembly = assembly;
    lastSavedPositions = JSON.stringify(positionsOf(assembly));
    lastSavedViewport = JSON.stringify(layout.viewport);
    useStudioStore.getState().loadAssembly(assembly);
    usePersistStore.setState({
      status: blocked ? "error" : "saved",
      error: blocked ? { message: blocked, fix: "Autosave is paused so the stored document is not overwritten. Use Overwrite to replace it." } : null,
      blocked,
      assemblyRevision: doc.revision,
      layoutRevision: layout.revision,
      viewport: layout.viewport,
      loaded: true,
      lastSavedAt: null,
    });
  } catch (err) {
    // Offline or first run: keep an empty, editable assembly; saving retries on the next change.
    lastSavedAssembly = null;
    useStudioStore.getState().loadAssembly(emptyAssembly(plantId));
    usePersistStore.setState({ status: "error", error: errorOf(err), loaded: true });
  }
  await useRulesStore.getState().load(plantId);
}

export async function saveNow(plantId: string, opts: { overwrite?: boolean } = {}): Promise<void> {
  if (inflight) {
    await inflight;
  }
  const run = async () => {
    const state = usePersistStore.getState();
    if ((state.status === "conflict" || state.blocked) && !opts.overwrite) return;
    const assembly = useStudioStore.getState().history.present;
    const positions = positionsOf(assembly);
    const positionsJson = JSON.stringify(positions);
    const viewportJson = JSON.stringify(state.viewport);
    const needAssembly = assembly !== lastSavedAssembly || (!!opts.overwrite && !!state.blocked);
    const needLayout = positionsJson !== lastSavedPositions || viewportJson !== lastSavedViewport;
    if (!needAssembly && !needLayout) {
      usePersistStore.setState({ status: "saved" });
      return;
    }
    const visible = needAssembly || positionsJson !== lastSavedPositions || !!opts.overwrite;
    if (visible) usePersistStore.setState({ status: "saving", error: null });
    const conflict = state.conflict;
    try {
      if (needAssembly || (opts.overwrite && conflict?.doc === "assembly")) {
        const base = opts.overwrite && conflict?.doc === "assembly" ? (conflict.currentRevision ?? undefined) : state.assemblyRevision;
        try {
          const res = await putStudioAssembly(plantId, assembly, base);
          lastSavedAssembly = assembly;
          usePersistStore.setState({ assemblyRevision: res.revision });
        } catch (err) {
          throw Object.assign(err as object, { doc: "assembly" as Doc });
        }
      }
      if (needLayout || (opts.overwrite && conflict?.doc === "layout")) {
        const cur = usePersistStore.getState();
        const base = opts.overwrite && conflict?.doc === "layout" ? (conflict.currentRevision ?? undefined) : cur.layoutRevision;
        try {
          const res = await putStudioLayout(plantId, { positions, viewport: cur.viewport, base_revision: base });
          lastSavedPositions = positionsJson;
          lastSavedViewport = viewportJson;
          usePersistStore.setState({ layoutRevision: res.revision });
        } catch (err) {
          throw Object.assign(err as object, { doc: "layout" as Doc });
        }
      }
      const dirtyAgain = useStudioStore.getState().history.present !== assembly;
      usePersistStore.setState({ status: dirtyAgain ? "dirty" : "saved", conflict: null, blocked: null, error: null, lastSavedAt: Date.now() });
      if (dirtyAgain) scheduleSave(plantId);
    } catch (err) {
      const doc = (err as { doc?: Doc }).doc ?? "assembly";
      if (err instanceof ApiError && err.status === 409) {
        const current = (err.body as { current_revision?: number }).current_revision ?? null;
        usePersistStore.setState({ status: "conflict", conflict: { doc, currentRevision: current } });
      } else {
        usePersistStore.setState({ status: "error", error: errorOf(err) });
      }
    }
  };
  inflight = run().finally(() => {
    inflight = null;
  });
  await inflight;
}

export function scheduleSave(plantId: string, delay = AUTOSAVE_MS, quiet = false): void {
  const { status, blocked } = usePersistStore.getState();
  if (status === "readonly" || status === "conflict" || status === "loading" || blocked) return;
  if (!quiet) usePersistStore.setState({ status: "dirty" });
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void saveNow(plantId);
  }, delay);
}

export function setViewport(plantId: string, viewport: StudioLayout["viewport"], canEdit: boolean): void {
  usePersistStore.setState({ viewport });
  if (canEdit && usePersistStore.getState().loaded) scheduleSave(plantId, AUTOSAVE_MS * 2, true);
}

export async function resolveConflict(plantId: string, choice: "reload" | "overwrite"): Promise<void> {
  if (choice === "reload") {
    await loadStudio(plantId);
    return;
  }
  await saveNow(plantId, { overwrite: true });
}

/** Wires loading + autosave for the page. */
export function useStudioPersistence(plantId: string, ready: boolean, canEdit: boolean): void {
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;

  useEffect(() => {
    if (!ready) return;
    void loadStudio(plantId).then(() => {
      if (!canEditRef.current) usePersistStore.setState({ status: "readonly" });
    });
  }, [plantId, ready]);

  useEffect(() => {
    if (!canEdit && usePersistStore.getState().loaded) usePersistStore.setState({ status: "readonly" });
  }, [canEdit]);

  useEffect(
    () =>
      useStudioStore.subscribe((s, prev) => {
        if (s.history.present === prev.history.present) return;
        if (!canEditRef.current || !usePersistStore.getState().loaded) return;
        scheduleSave(plantId);
      }),
    [plantId],
  );

  useEffect(
    () => () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
        // Flush on leave so nothing typed in the last 600 ms is lost.
        if (canEditRef.current) void saveNow(plantId);
      }
    },
    [plantId],
  );
}

/** Test helper. */
export function resetPersistence(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  inflight = null;
  lastSavedAssembly = null;
  lastSavedPositions = "";
  lastSavedViewport = "";
  usePersistStore.setState({ status: "loading", assemblyRevision: 0, layoutRevision: 0, conflict: null, error: null, lastSavedAt: null, viewport: null, loaded: false, blocked: null });
}
