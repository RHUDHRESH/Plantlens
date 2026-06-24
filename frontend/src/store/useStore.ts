/**
 * Zustand single state tree (Domain W). One source of frontend truth.
 * WebSocket pushes canonical/Situation deltas; REST is for cold reads.
 * Don't duplicate state logic across the two.
 */
import { create } from "zustand";
import { connectWs, fetchState } from "../api/ws";

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
  role: "operator" | "maintenance" | "supervisor" | "engineer";
  connect: () => Promise<void>;
  setZoom: (z: State["zoom"]) => void;
  setActive: (s: Situation | null) => void;
}

export const useStore = create<State>((set) => ({
  values: [],
  situations: [],
  activeSituation: null,
  degraded: false,
  zoom: "macro",
  role: "operator",
  connect: async () => {
    const initial = await fetchState();
    set({ values: initial.values, situations: initial.situations, degraded: initial.degraded });
    connectWs((msg) =>
      set({
        values: msg.values,
        situations: msg.situations,
        degraded: msg.degraded,
        activeSituation: msg.situations[0] ?? null,
      }),
    );
  },
  setZoom: (z) => set({ zoom: z }),
  setActive: (s) => set({ activeSituation: s }),
}));
