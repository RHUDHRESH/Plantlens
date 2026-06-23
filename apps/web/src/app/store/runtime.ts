/**
 * Live runtime snapshot store (Zustand) — written by WebSocket updates and REST snapshot refresh.
 * REST/cache state lives in TanStack Query, not here.
 */
import { create } from "zustand";
import type { CalmCard } from "../schemas/calmCard";
import type { PlantHMIState } from "../schemas/plantHmi";
import type { Situation } from "../schemas/situation";
import type { TagFrame } from "../schemas/tagFrame";
import type { ActiveAlarm, RuntimeSnapshot, WsConnectionState } from "../../api/types";
import type { AssetStatus } from "../../features/maps2d/mapTypes";

export type ScenarioRunStatus = "idle" | "started" | "running" | "finished" | "stopped";

export interface ScenarioState {
  scenarioId: string | null;
  status: ScenarioRunStatus;
  progress: number | null;
}

export interface RuntimeStore {
  tags: Record<string, TagFrame>;
  assetStatus: Record<string, AssetStatus>;
  activeAlarms: ActiveAlarm[];
  activeSituation: Situation | null;
  calmCard: CalmCard | null;
  connection: WsConnectionState;
  lastSnapshotTs: string | null;
  hasSnapshot: boolean;
  scenarioState: ScenarioState;
  hmiState: PlantHMIState | null;
  lastHmiStateTs: string | null;
  applySnapshot: (snapshot: RuntimeSnapshot, ts?: string) => void;
  applyHmiState: (state: PlantHMIState, ts?: string) => void;
  setConnection: (state: WsConnectionState) => void;
  setScenarioState: (state: ScenarioState) => void;
  reset: () => void;
}

const INITIAL_SCENARIO: ScenarioState = {
  scenarioId: null,
  status: "idle",
  progress: null,
};

const INITIAL: Omit<
  RuntimeStore,
  "applySnapshot" | "applyHmiState" | "setConnection" | "setScenarioState" | "reset"
> = {
  tags: {},
  assetStatus: {},
  activeAlarms: [],
  activeSituation: null,
  calmCard: null,
  connection: "disconnected",
  lastSnapshotTs: null,
  hasSnapshot: false,
  scenarioState: INITIAL_SCENARIO,
  hmiState: null,
  lastHmiStateTs: null,
};

function normalizeAssetStatus(raw: Record<string, string>): Record<string, AssetStatus> {
  const out: Record<string, AssetStatus> = {};
  for (const [id, status] of Object.entries(raw)) {
    if (
      status === "normal" ||
      status === "warning" ||
      status === "critical" ||
      status === "sensor_bad" ||
      status === "offline"
    ) {
      out[id] = status;
    } else {
      out[id] = "unknown";
    }
  }
  return out;
}

export const useRuntimeStore = create<RuntimeStore>((set) => ({
  ...INITIAL,
  applySnapshot: (snapshot, ts) =>
    set({
      tags: snapshot.tags ?? {},
      assetStatus: normalizeAssetStatus(snapshot.asset_status ?? {}),
      activeAlarms: snapshot.active_alarms ?? [],
      activeSituation: snapshot.active_situations?.[0] ?? null,
      calmCard: snapshot.latest_calm_card ?? null,
      lastSnapshotTs: ts ?? null,
      hasSnapshot: true,
    }),
  applyHmiState: (state, ts) =>
    set({
      hmiState: state,
      lastHmiStateTs: ts ?? state.generated_at ?? null,
    }),
  setConnection: (connection) => set({ connection }),
  setScenarioState: (scenarioState) => set({ scenarioState }),
  reset: () => set({ ...INITIAL, scenarioState: INITIAL_SCENARIO }),
}));
