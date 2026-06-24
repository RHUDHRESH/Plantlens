/**
 * Zustand single state tree (Domain W). One source of frontend truth.
 * WebSocket pushes canonical/Situation deltas; REST is for cold reads.
 * Don't duplicate state logic across the two.
 */
import { create } from "zustand";
import { connectWs, fetchState } from "../api/ws";
import {
  DEMO_ASSETS,
  DEMO_SITUATIONS,
  resolveSituations,
} from "../data/demoPlant";
import type {
  AppScreen,
  AssetValidationStatus,
  BottomSheetMode,
  ConnectionStatus,
  LayoutValidationStatus,
  MobileTab,
  Role,
  SourceMode,
  ThemeMode,
} from "../design/types";
import type {
  LayoutBlockModel,
  LayoutConnectionModel,
  LayoutMode,
  LayoutValidationIssue,
} from "../components/layoutStudio/layoutStudioTypes";
import {
  DEMO_LAYOUT_BLOCKS,
  DEMO_LAYOUT_CONNECTIONS,
  DEMO_VALIDATION_ISSUES,
  createBlockFromPalette,
  getPaletteItem,
  validateLayoutDraft as runLayoutValidation,
} from "../components/layoutStudio/demoLayoutData";
import type { ValidationItem } from "../components/studio/studioTypes";
import {
  buildParameterMap,
  getAssetTemplate,
  getDefaultTemplateId,
  resolveTemplateForInstance,
  validateAssetDraft as runAssetValidation,
} from "../components/studio/demoAssetTemplates";
import type {
  DagHighlightMode,
  DagLayerName,
  DagLayerVisibility,
} from "../components/dag/dagTypes";

export interface CanonicalValue {
  instance_id: string;
  signal_key: string;
  value: number | number[];
  unit?: string;
  quality: "good" | "uncertain" | "bad";
  ts: number;
  source: string;
}

export interface Situation {
  id: string;
  primary_fault: string;
  confidence: number;
  coverage: number;
  grouping_confidence: number;
  member_signals: string[];
  downstream: string[];
  spurious: string[];
  ts: number;
}

interface State {
  values: CanonicalValue[];
  situations: Situation[];
  activeSituation: Situation | null;
  degraded: boolean;
  zoom: "macro" | "meso" | "micro";
  themeMode: ThemeMode;
  role: Role;
  sourceMode: SourceMode;
  connectionStatus: ConnectionStatus;
  selectedAssetId: string | null;
  selectedSituationId: string | null;
  selectedAreaId: string;
  bottomSheetMode: BottomSheetMode;
  rightPanelOpen: boolean;
  leftRailOpen: boolean;
  copilotOpen: boolean;
  mobileTab: MobileTab;
  screen: AppScreen;
  copilotPrefill: string | null;
  selectedDagNodeId: string | null;
  selectedDagEdgeId: string | null;
  dagLayerVisibility: DagLayerVisibility;
  dagHighlightMode: DagHighlightMode;
  dagSearchQuery: string;
  selectedAssetTypeId: string;
  selectedAssetInstanceId: string | null;
  assetDraftParameters: Record<string, number | string>;
  assetDraftDirty: boolean;
  assetDraftSaved: boolean;
  assetValidationStatus: AssetValidationStatus;
  assetValidationItems: ValidationItem[];
  studioLibrarySearch: string;
  studioParameterSearch: string;
  layoutBlocks: LayoutBlockModel[];
  layoutConnections: LayoutConnectionModel[];
  selectedLayoutBlockId: string | null;
  layoutDraftDirty: boolean;
  layoutDraftSaved: boolean;
  layoutValidationStatus: LayoutValidationStatus;
  layoutValidationItems: LayoutValidationIssue[];
  layoutMode: LayoutMode;
  layoutPaletteSearch: string;
  connect: () => Promise<void>;
  setZoom: (z: State["zoom"]) => void;
  setActive: (s: Situation | null) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setRole: (role: Role) => void;
  setSourceMode: (mode: SourceMode) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setSelectedAssetId: (id: string | null) => void;
  setSelectedAsset: (id: string | null) => void;
  setSelectedSituationId: (id: string | null) => void;
  setSelectedSituation: (id: string | null) => void;
  setSelectedAreaId: (id: string) => void;
  setBottomSheetMode: (mode: BottomSheetMode) => void;
  setRightPanelOpen: (open: boolean) => void;
  setLeftRailOpen: (open: boolean) => void;
  setCopilotOpen: (open: boolean) => void;
  setMobileTab: (tab: MobileTab) => void;
  toggleRightPanel: () => void;
  toggleLeftRail: () => void;
  toggleCopilot: () => void;
  cycleRole: () => void;
  setScreen: (screen: AppScreen) => void;
  openEvidenceRoom: (situationId: string) => void;
  goBackToMap: () => void;
  openCopilotWithPrompt: (prompt: string) => void;
  clearCopilotPrefill: () => void;
  openDagView: (situationId?: string) => void;
  goBackToEvidence: () => void;
  setSelectedDagNodeId: (id: string | null) => void;
  setSelectedDagEdgeId: (id: string | null) => void;
  toggleDagLayer: (layer: DagLayerName) => void;
  setDagHighlightMode: (mode: DagHighlightMode) => void;
  setDagSearchQuery: (query: string) => void;
  openAssetStudio: (assetTypeId?: string, assetInstanceId?: string | null) => void;
  goBackToDag: () => void;
  setSelectedAssetTypeId: (typeId: string) => void;
  updateAssetParameter: (key: string, value: number | string) => void;
  validateAssetDraft: () => void;
  saveAssetDraft: () => void;
  setStudioLibrarySearch: (query: string) => void;
  setStudioParameterSearch: (query: string) => void;
  openPlantLayoutStudio: () => void;
  goBackToAssetStudio: () => void;
  setSelectedLayoutBlockId: (id: string | null) => void;
  setLayoutDraftDirty: (dirty: boolean) => void;
  setLayoutValidationStatus: (status: LayoutValidationStatus) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  setLayoutPaletteSearch: (query: string) => void;
  addBlockFromPalette: (paletteItemId: string, x?: number, y?: number) => void;
  validateLayoutDraft: () => void;
  saveLayoutDraft: () => void;
}

function connectionFromDegraded(degraded: boolean): ConnectionStatus {
  return degraded ? "degraded" : "online";
}

const initialSituations = DEMO_SITUATIONS;
const initialTop = initialSituations[0] ?? null;
const initialAssetTypeId = getDefaultTemplateId();
const initialTemplate = getAssetTemplate(initialAssetTypeId);
const initialDraftParams = initialTemplate
  ? buildParameterMap(initialTemplate)
  : {};

function initialValidation(): { status: AssetValidationStatus; items: ValidationItem[] } {
  if (!initialTemplate) return { status: "unknown", items: [] };
  return runAssetValidation(initialTemplate, initialDraftParams);
}

const initialValidationResult = initialValidation();

export const useStore = create<State>((set, get) => ({
  values: [],
  situations: initialSituations,
  activeSituation: initialTop,
  degraded: false,
  zoom: "macro",
  themeMode: "dark",
  role: "operator",
  sourceMode: "sim",
  connectionStatus: "online",
  selectedAssetId: DEMO_ASSETS[0]?.id ?? null,
  selectedSituationId: initialTop?.id ?? null,
  selectedAreaId: "area-a",
  bottomSheetMode: "peek",
  rightPanelOpen: true,
  leftRailOpen: true,
  copilotOpen: false,
  mobileTab: "map",
  screen: "map",
  copilotPrefill: null,
  selectedDagNodeId: null,
  selectedDagEdgeId: null,
  dagLayerVisibility: {
    faults: true,
    signals: true,
    alarms: true,
    actions: true,
    hiddenNormal: false,
  },
  dagHighlightMode: "path",
  dagSearchQuery: "",
  selectedAssetTypeId: initialAssetTypeId,
  selectedAssetInstanceId: DEMO_ASSETS[0]?.id ?? null,
  assetDraftParameters: initialDraftParams,
  assetDraftDirty: false,
  assetDraftSaved: false,
  assetValidationStatus: initialValidationResult.status,
  assetValidationItems: initialValidationResult.items,
  studioLibrarySearch: "",
  studioParameterSearch: "",
  layoutBlocks: DEMO_LAYOUT_BLOCKS,
  layoutConnections: DEMO_LAYOUT_CONNECTIONS,
  selectedLayoutBlockId: "blk-m-101",
  layoutDraftDirty: false,
  layoutDraftSaved: false,
  layoutValidationStatus: "warning",
  layoutValidationItems: DEMO_VALIDATION_ISSUES,
  layoutMode: "select",
  layoutPaletteSearch: "",

  connect: async () => {
    try {
      const initial = await fetchState();
      const situations = resolveSituations(initial.situations);
      const connectionStatus = connectionFromDegraded(initial.degraded);
      const top = situations[0] ?? null;
      set({
        values: initial.values,
        situations,
        degraded: initial.degraded,
        connectionStatus,
        activeSituation: top,
        selectedSituationId: top?.id ?? null,
      });
      connectWs((msg) => {
        const resolved = resolveSituations(msg.situations);
        const topSit = resolved[0] ?? null;
        const prevSelected = get().selectedSituationId;
        const stillValid = prevSelected
          ? resolved.some((s) => s.id === prevSelected)
          : false;
        set({
          values: msg.values,
          situations: resolved,
          degraded: msg.degraded,
          connectionStatus: connectionFromDegraded(msg.degraded),
          activeSituation: topSit,
          selectedSituationId: stillValid ? prevSelected : (topSit?.id ?? null),
        });
      });
    } catch {
      /* Demo mode — keep scaffold defaults when backend unavailable */
    }
  },

  setZoom: (z) => set({ zoom: z }),
  setActive: (s) =>
    set({ activeSituation: s, selectedSituationId: s?.id ?? null }),
  setThemeMode: (mode) => set({ themeMode: mode }),
  setRole: (role) => set({ role }),
  setSourceMode: (mode) => set({ sourceMode: mode }),
  setConnectionStatus: (status) =>
    set({
      connectionStatus: status,
      degraded: status === "degraded",
    }),
  setSelectedAssetId: (id) => set({ selectedAssetId: id }),
  setSelectedAsset: (id) =>
    set({ selectedAssetId: id, rightPanelOpen: id !== null }),
  setSelectedSituationId: (id) => set({ selectedSituationId: id }),
  setSelectedSituation: (id) => {
    const situation = get().situations.find((s) => s.id === id) ?? null;
    set({
      selectedSituationId: id,
      activeSituation: situation,
    });
  },
  setSelectedAreaId: (id) => set({ selectedAreaId: id }),
  setBottomSheetMode: (mode) => set({ bottomSheetMode: mode }),
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  setLeftRailOpen: (open) => set({ leftRailOpen: open }),
  setCopilotOpen: (open) => set({ copilotOpen: open }),
  setMobileTab: (tab) => set({ mobileTab: tab }),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  toggleLeftRail: () => set((s) => ({ leftRailOpen: !s.leftRailOpen })),
  toggleCopilot: () => set((s) => ({ copilotOpen: !s.copilotOpen })),
  cycleRole: () => {
    const roles: Role[] = ["operator", "maintenance", "supervisor", "engineer"];
    const idx = roles.indexOf(get().role);
    set({ role: roles[(idx + 1) % roles.length] ?? "operator" });
  },
  setScreen: (screen) => set({ screen }),
  openEvidenceRoom: (situationId) => {
    const situation = get().situations.find((s) => s.id === situationId) ?? null;
    set({
      screen: "evidence",
      selectedSituationId: situationId,
      activeSituation: situation,
      leftRailOpen: true,
      rightPanelOpen: true,
      mobileTab: "situations",
    });
  },
  goBackToMap: () =>
    set({
      screen: "map",
      mobileTab: "map",
      bottomSheetMode: "peek",
    }),
  openCopilotWithPrompt: (prompt) =>
    set({ copilotOpen: true, copilotPrefill: prompt }),
  clearCopilotPrefill: () => set({ copilotPrefill: null }),
  openDagView: (situationId) => {
    const id = situationId ?? get().selectedSituationId ?? get().situations[0]?.id;
    if (!id) return;
    const situation = get().situations.find((s) => s.id === id) ?? null;
    set({
      screen: "dag",
      selectedSituationId: id,
      activeSituation: situation,
      selectedDagNodeId: null,
      selectedDagEdgeId: null,
      dagHighlightMode: "path",
      leftRailOpen: true,
      rightPanelOpen: true,
    });
  },
  goBackToEvidence: () => {
    const id = get().selectedSituationId ?? get().situations[0]?.id;
    if (id) {
      get().openEvidenceRoom(id);
    } else {
      set({ screen: "evidence" });
    }
  },
  setSelectedDagNodeId: (id) =>
    set({ selectedDagNodeId: id, selectedDagEdgeId: null }),
  setSelectedDagEdgeId: (id) =>
    set({ selectedDagEdgeId: id, selectedDagNodeId: null }),
  toggleDagLayer: (layer) =>
    set((s) => ({
      dagLayerVisibility: {
        ...s.dagLayerVisibility,
        [layer]: !s.dagLayerVisibility[layer],
      },
    })),
  setDagHighlightMode: (mode) => set({ dagHighlightMode: mode }),
  setDagSearchQuery: (query) => set({ dagSearchQuery: query }),

  openAssetStudio: (assetTypeId, assetInstanceId) => {
    const instanceId =
      assetInstanceId !== undefined
        ? assetInstanceId
        : get().selectedAssetInstanceId ?? get().selectedAssetId;
    const typeId =
      assetTypeId ??
      (instanceId ? resolveTemplateForInstance(instanceId) : get().selectedAssetTypeId);
    const template = getAssetTemplate(typeId);
    if (!template) return;
    const params = buildParameterMap(template);
    const validation = runAssetValidation(template, params);
    set({
      screen: "assetStudio",
      selectedAssetTypeId: typeId,
      selectedAssetInstanceId: instanceId ?? null,
      assetDraftParameters: params,
      assetDraftDirty: false,
      assetDraftSaved: false,
      assetValidationStatus: validation.status,
      assetValidationItems: validation.items,
      studioLibrarySearch: "",
      studioParameterSearch: "",
      leftRailOpen: true,
      rightPanelOpen: true,
      mobileTab: "studio",
    });
  },

  goBackToDag: () => {
    const id = get().selectedSituationId ?? get().situations[0]?.id;
    if (id) {
      get().openDagView(id);
    } else {
      set({ screen: "dag" });
    }
  },

  setSelectedAssetTypeId: (typeId) => {
    const template = getAssetTemplate(typeId);
    if (!template) return;
    const params = buildParameterMap(template);
    const validation = runAssetValidation(template, params);
    set({
      selectedAssetTypeId: typeId,
      assetDraftParameters: params,
      assetDraftDirty: false,
      assetDraftSaved: false,
      assetValidationStatus: validation.status,
      assetValidationItems: validation.items,
    });
  },

  updateAssetParameter: (key, value) => {
    if (get().role !== "engineer") return;
    const typeId = get().selectedAssetTypeId;
    const template = getAssetTemplate(typeId);
    if (!template) return;
    const next = { ...get().assetDraftParameters, [key]: value };
    const validation = runAssetValidation(template, next);
    set({
      assetDraftParameters: next,
      assetDraftDirty: true,
      assetDraftSaved: false,
      assetValidationStatus: validation.status,
      assetValidationItems: validation.items,
    });
  },

  validateAssetDraft: () => {
    const template = getAssetTemplate(get().selectedAssetTypeId);
    if (!template) return;
    const validation = runAssetValidation(template, get().assetDraftParameters);
    set({
      assetValidationStatus: validation.status,
      assetValidationItems: validation.items,
    });
  },

  saveAssetDraft: () => {
    if (!get().assetDraftDirty) return;
    set({ assetDraftDirty: false, assetDraftSaved: true });
  },

  setStudioLibrarySearch: (query) => set({ studioLibrarySearch: query }),
  setStudioParameterSearch: (query) => set({ studioParameterSearch: query }),

  openPlantLayoutStudio: () => {
    const validation = runLayoutValidation(
      get().layoutBlocks.length > 0 ? get().layoutBlocks : DEMO_LAYOUT_BLOCKS,
      get().layoutConnections.length > 0
        ? get().layoutConnections
        : DEMO_LAYOUT_CONNECTIONS,
    );
    set({
      screen: "plantLayoutStudio",
      selectedLayoutBlockId: get().selectedLayoutBlockId ?? "blk-m-101",
      layoutValidationStatus: validation.status,
      layoutValidationItems: validation.items,
      leftRailOpen: true,
      rightPanelOpen: true,
      mobileTab: "studio",
    });
  },

  goBackToAssetStudio: () => {
    set({
      screen: "assetStudio",
      mobileTab: "studio",
    });
  },

  setSelectedLayoutBlockId: (id) => set({ selectedLayoutBlockId: id }),

  setLayoutDraftDirty: (dirty) => set({ layoutDraftDirty: dirty }),

  setLayoutValidationStatus: (status) => set({ layoutValidationStatus: status }),

  setLayoutMode: (mode) => set({ layoutMode: mode }),

  setLayoutPaletteSearch: (query) => set({ layoutPaletteSearch: query }),

  addBlockFromPalette: (paletteItemId, x, y) => {
    if (get().role !== "engineer") return;
    const item = getPaletteItem(paletteItemId);
    if (!item) return;
    const blocks = get().layoutBlocks;
    const dropX = x ?? 80 + (blocks.length % 5) * 40;
    const dropY = y ?? 80 + Math.floor(blocks.length / 5) * 80;
    const block = createBlockFromPalette(item, dropX, dropY, blocks);
    const nextBlocks = [...blocks, block];
    const validation = runLayoutValidation(nextBlocks, get().layoutConnections);
    set({
      layoutBlocks: nextBlocks,
      selectedLayoutBlockId: block.id,
      layoutDraftDirty: true,
      layoutDraftSaved: false,
      layoutValidationStatus: validation.status,
      layoutValidationItems: validation.items,
    });
  },

  validateLayoutDraft: () => {
    const validation = runLayoutValidation(
      get().layoutBlocks,
      get().layoutConnections,
    );
    set({
      layoutValidationStatus: validation.status,
      layoutValidationItems: validation.items,
    });
  },

  saveLayoutDraft: () => {
    if (!get().layoutDraftDirty) return;
    set({ layoutDraftDirty: false, layoutDraftSaved: true });
  },
}));