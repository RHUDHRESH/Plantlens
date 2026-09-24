/**
 * Plant Studio store. The assembly document (forms-backed source of truth, R4) lives inside an undo
 * history; the canvas is a projection of `history.present`. Selection, notices and view toggles are
 * UI state and are never part of undo.
 */
import { create } from "zustand";
import type { PlantAssembly, PlantConnection } from "../../app/schemas/plantAssembly";
import type { Proposal } from "../connection-rules/types";
import type { ComponentTemplate } from "./componentLibraryTypes";
import {
  addAsset,
  addConnection,
  buildConnectionFromPorts,
  emptyAssembly,
  moveAssets,
  reconnect,
  removeElements,
  setLoopOk,
  updateAsset,
  updateConnection,
  type XY,
} from "./model/assemblyOps";
import { copySelection, pasteClipboard, PASTE_OFFSET, type ClipboardPayload } from "./model/clipboard";
import { createHistory, historyReducer, type History } from "./model/history";

export { buildConnectionFromPorts, nextConnectionId } from "./model/assemblyOps";

export interface Notice {
  id: number;
  tone: "info" | "warn" | "error";
  message: string;
  fix?: string | undefined;
}

export interface Selection {
  nodes: string[];
  edges: string[];
}

const EMPTY_SELECTION: Selection = { nodes: [], edges: [] };

let noticeSeq = 0;
let clipboard: ClipboardPayload | null = null;
let pasteCount = 0;

export interface StudioState {
  plantId: string;
  library: ComponentTemplate[];
  templates: Map<string, ComponentTemplate>;
  history: History<PlantAssembly>;
  selection: Selection;
  renamingId: string | null;
  notice: Notice | null;
  snapEnabled: boolean;
  showLagLabels: boolean;
  paletteCollapsed: boolean;
  /** Template being dragged from the palette (dataTransfer is unreadable during dragover). */
  draggingTemplateId: string | null;

  setLibrary: (components: ComponentTemplate[]) => void;
  loadAssembly: (assembly: PlantAssembly) => void;
  commit: (label: string, next: (assembly: PlantAssembly) => PlantAssembly) => boolean;
  undo: () => void;
  redo: () => void;

  addComponent: (templateId: string, position: XY) => string | null;
  moveNodes: (positions: Record<string, XY>, label?: string) => void;
  deleteSelection: () => void;
  deleteElements: (nodes: string[], edges: string[]) => void;
  connect: (proposal: Proposal, medium: string) => PlantConnection | null;
  reconnectEdge: (connectionId: string, proposal: Proposal, medium: string) => void;
  renameAsset: (assetId: string, name: string) => void;
  setAssetNotes: (assetId: string, notes: string) => void;
  patchConnection: (connectionId: string, patch: Partial<Pick<PlantConnection, "lag_min_ms" | "lag_max_ms" | "notes">>) => void;
  setConnectionLoopOk: (connectionId: string, loopOk: boolean) => void;

  copy: () => boolean;
  cut: () => void;
  paste: (anchor?: XY) => void;
  duplicate: () => void;

  setSelection: (selection: Partial<Selection>) => void;
  selectAll: () => void;
  clearSelection: () => void;
  startRename: (assetId: string | null) => void;
  showNotice: (tone: Notice["tone"], message: string, fix?: string) => void;
  dismissNotice: () => void;
  setSnapEnabled: (on: boolean) => void;
  setShowLagLabels: (on: boolean) => void;
  setPaletteCollapsed: (on: boolean) => void;
  setDraggingTemplate: (id: string | null) => void;
  /** Drop selected ids that no longer exist (after undo/redo). */
  pruneSelection: () => void;
}

const initial = () => ({
  plantId: emptyAssembly().plant_id,
  library: [] as ComponentTemplate[],
  templates: new Map<string, ComponentTemplate>(),
  history: createHistory(emptyAssembly()),
  selection: EMPTY_SELECTION,
  renamingId: null,
  notice: null,
  snapEnabled: true,
  showLagLabels: false,
  paletteCollapsed: false,
  draggingTemplateId: null,
});

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export const useStudioStore = create<StudioState>((set, get) => ({
  ...initial(),

  setLibrary: (components) =>
    set({ library: components, templates: new Map(components.map((c) => [c.component_type_id, c])) }),

  loadAssembly: (assembly) =>
    set({ history: createHistory(assembly), plantId: assembly.plant_id, selection: EMPTY_SELECTION, renamingId: null }),

  commit: (label, fn) => {
    const { history } = get();
    const next = fn(history.present);
    if (next === history.present) return false;
    set({ history: historyReducer(history, { type: "commit", next, label }) });
    return true;
  },

  undo: () => {
    const { history } = get();
    if (!history.past.length) return;
    const label = history.presentLabel;
    set({ history: historyReducer(history, { type: "undo" }) });
    get().pruneSelection();
    get().showNotice("info", `Undid: ${label || "change"}`);
  },

  redo: () => {
    const { history } = get();
    if (!history.future.length) return;
    set({ history: historyReducer(history, { type: "redo" }) });
    get().pruneSelection();
  },

  addComponent: (templateId, position) => {
    const template = get().templates.get(templateId);
    if (!template) return null;
    let assetId: string | null = null;
    get().commit(`Add ${template.display_name}`, (a) => {
      const result = addAsset(a, template, position);
      assetId = result.assetId;
      return result.assembly;
    });
    if (assetId) set({ selection: { nodes: [assetId], edges: [] } });
    return assetId;
  },

  moveNodes: (positions, label) => {
    const n = Object.keys(positions).length;
    get().commit(label ?? `Move ${n === 1 ? "component" : `${n} components`}`, (a) => moveAssets(a, positions));
  },

  deleteSelection: () => {
    const { nodes, edges } = get().selection;
    get().deleteElements(nodes, edges);
  },

  deleteElements: (nodes, edges) => {
    if (!nodes.length && !edges.length) return;
    const parts: string[] = [];
    if (nodes.length) parts.push(nodes.length === 1 ? "1 component" : `${nodes.length} components`);
    if (edges.length) parts.push(edges.length === 1 ? "1 connection" : `${edges.length} connections`);
    if (get().commit(`Delete ${parts.join(" and ")}`, (a) => removeElements(a, nodes, edges))) {
      set({ selection: EMPTY_SELECTION });
    }
  },

  connect: (proposal, medium) => {
    const present = get().history.present;
    const connection = buildConnectionFromPorts(
      proposal.fromAssetId,
      proposal.fromPortId,
      proposal.toAssetId,
      proposal.toPortId,
      medium,
      present.connections,
    );
    if (!get().commit(`Connect ${proposal.fromAssetId} → ${proposal.toAssetId}`, (a) => addConnection(a, connection))) return null;
    set({ selection: { nodes: [], edges: [connection.connection_id] } });
    return connection;
  },

  reconnectEdge: (connectionId, proposal, medium) => {
    get().commit(`Reconnect ${connectionId}`, (a) => reconnect(a, connectionId, proposal, medium));
    set({ selection: { nodes: [], edges: [connectionId] } });
  },

  renameAsset: (assetId, name) => {
    get().commit(`Rename ${assetId}`, (a) => updateAsset(a, assetId, { display_name: name }));
    set({ renamingId: null });
  },

  setAssetNotes: (assetId, notes) => {
    get().commit(`Edit notes on ${assetId}`, (a) => updateAsset(a, assetId, { notes }));
  },

  patchConnection: (connectionId, patch) => {
    get().commit(`Edit ${connectionId}`, (a) => updateConnection(a, connectionId, patch));
  },

  setConnectionLoopOk: (connectionId, loopOk) => {
    get().commit(`${loopOk ? "Flag" : "Unflag"} loop on ${connectionId}`, (a) => setLoopOk(a, connectionId, loopOk));
  },

  copy: () => {
    const payload = copySelection(get().history.present, get().selection.nodes);
    if (!payload) return false;
    clipboard = payload;
    pasteCount = 0;
    return true;
  },

  cut: () => {
    if (get().copy()) get().deleteSelection();
  },

  paste: (anchor) => {
    if (!clipboard) return;
    const payload = clipboard;
    pasteCount += 1;
    let result: ReturnType<typeof pasteClipboard> | null = null;
    get().commit(`Paste ${payload.assets.length} component${payload.assets.length === 1 ? "" : "s"}`, (a) => {
      result = pasteClipboard(a, payload, anchor ? { anchor } : { offset: { x: PASTE_OFFSET * pasteCount, y: PASTE_OFFSET * pasteCount } });
      return result.assembly;
    });
    const r = result as ReturnType<typeof pasteClipboard> | null;
    if (r) set({ selection: { nodes: r.assetIds, edges: r.connectionIds } });
  },

  duplicate: () => {
    const payload = copySelection(get().history.present, get().selection.nodes);
    if (!payload) return;
    let result: ReturnType<typeof pasteClipboard> | null = null;
    get().commit(`Duplicate ${payload.assets.length} component${payload.assets.length === 1 ? "" : "s"}`, (a) => {
      result = pasteClipboard(a, payload, { offset: { x: PASTE_OFFSET, y: PASTE_OFFSET } });
      return result.assembly;
    });
    const r = result as ReturnType<typeof pasteClipboard> | null;
    if (r) set({ selection: { nodes: r.assetIds, edges: r.connectionIds } });
  },

  setSelection: (patch) => {
    const cur = get().selection;
    const next = { nodes: patch.nodes ?? cur.nodes, edges: patch.edges ?? cur.edges };
    if (same(next.nodes, cur.nodes) && same(next.edges, cur.edges)) return;
    set({ selection: next });
  },

  selectAll: () => {
    const a = get().history.present;
    set({ selection: { nodes: a.assets.map((x) => x.asset_id), edges: a.connections.map((c) => c.connection_id) } });
  },

  clearSelection: () => set({ selection: EMPTY_SELECTION, renamingId: null }),

  startRename: (assetId) => set({ renamingId: assetId }),

  showNotice: (tone, message, fix) => set({ notice: { id: ++noticeSeq, tone, message, fix } }),
  dismissNotice: () => set({ notice: null }),
  setSnapEnabled: (on) => set({ snapEnabled: on }),
  setShowLagLabels: (on) => set({ showLagLabels: on }),
  setPaletteCollapsed: (on) => set({ paletteCollapsed: on }),
  setDraggingTemplate: (id) => set({ draggingTemplateId: id }),

  pruneSelection: () => {
    const a = get().history.present;
    const nodes = new Set(a.assets.map((x) => x.asset_id));
    const edges = new Set(a.connections.map((c) => c.connection_id));
    const cur = get().selection;
    get().setSelection({ nodes: cur.nodes.filter((n) => nodes.has(n)), edges: cur.edges.filter((e) => edges.has(e)) });
  },
}));

/** Test helper: back to a clean store. */
export function resetStudioStore(): void {
  clipboard = null;
  pasteCount = 0;
  useStudioStore.setState(initial());
}

export const selectAssembly = (s: StudioState) => s.history.present;
