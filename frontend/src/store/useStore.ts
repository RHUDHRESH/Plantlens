/**
 * Zustand single state tree (Domain W). One source of frontend truth.
 * WebSocket pushes canonical/Situation deltas; REST is for cold reads.
 * Don't duplicate state logic across the two.
 */
import { create } from "zustand";
import { connectWs, fetchState } from "../api/ws";
import type {
  BottomSheetMode,
  ConnectionStatus,
  MobileTab,
  Role,
  SourceMode,
  ThemeMode,
} from "../design/types";

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
  bottomSheetMode: BottomSheetMode;
  rightPanelOpen: boolean;
  leftRailOpen: boolean;
  copilotOpen: boolean;
  mobileTab: MobileTab;
  connect: () => Promise<void>;
  setZoom: (z: State["zoom"]) => void;
  setActive: (s: Situation | null) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setRole: (role: Role) => void;
  setSourceMode: (mode: SourceMode) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setSelectedAssetId: (id: string | null) => void;
  setSelectedSituationId: (id: string | null) => void;
  setBottomSheetMode: (mode: BottomSheetMode) => void;
  setRightPanelOpen: (open: boolean) => void;
  setLeftRailOpen: (open: boolean) => void;
  setCopilotOpen: (open: boolean) => void;
  setMobileTab: (tab: MobileTab) => void;
  toggleRightPanel: () => void;
  toggleLeftRail: () => void;
  toggleCopilot: () => void;
}

function connectionFromDegraded(degraded: boolean): ConnectionStatus {
  return degraded ? "degraded" : "online";
}

export const useStore = create<State>((set, get) => ({
  values: [],
  situations: [],
  activeSituation: null,
  degraded: false,
  zoom: "macro",
  themeMode: "dark",
  role: "operator",
  sourceMode: "sim",
  connectionStatus: "online",
  selectedAssetId: null,
  selectedSituationId: null,
  bottomSheetMode: "peek",
  rightPanelOpen: false,
  leftRailOpen: true,
  copilotOpen: false,
  mobileTab: "map",

  connect: async () => {
    const initial = await fetchState();
    const connectionStatus = connectionFromDegraded(initial.degraded);
    const firstSituation = initial.situations[0] ?? null;
    set({
      values: initial.values,
      situations: initial.situations,
      degraded: initial.degraded,
      connectionStatus,
      activeSituation: firstSituation,
      selectedSituationId: firstSituation?.id ?? null,
    });
    connectWs((msg) => {
      const top = msg.situations[0] ?? null;
      const prevSelected = get().selectedSituationId;
      const stillValid = prevSelected
        ? msg.situations.some((s) => s.id === prevSelected)
        : false;
      set({
        values: msg.values,
        situations: msg.situations,
        degraded: msg.degraded,
        connectionStatus: connectionFromDegraded(msg.degraded),
        activeSituation: top,
        selectedSituationId: stillValid ? prevSelected : (top?.id ?? null),
      });
    });
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
  setSelectedSituationId: (id) => set({ selectedSituationId: id }),
  setBottomSheetMode: (mode) => set({ bottomSheetMode: mode }),
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  setLeftRailOpen: (open) => set({ leftRailOpen: open }),
  setCopilotOpen: (open) => set({ copilotOpen: open }),
  setMobileTab: (tab) => set({ mobileTab: tab }),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  toggleLeftRail: () => set((s) => ({ leftRailOpen: !s.leftRailOpen })),
  toggleCopilot: () => set((s) => ({ copilotOpen: !s.copilotOpen })),
}));