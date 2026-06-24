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
  BottomSheetMode,
  ConnectionStatus,
  MobileTab,
  Role,
  SourceMode,
  ThemeMode,
} from "../design/types";
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
}

function connectionFromDegraded(degraded: boolean): ConnectionStatus {
  return degraded ? "degraded" : "online";
}

const initialSituations = DEMO_SITUATIONS;
const initialTop = initialSituations[0] ?? null;

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
}));