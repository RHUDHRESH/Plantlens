import { create } from "zustand";
import { DEFAULT_TREE_EXPANDED } from "../../features/atlas/treeStructure";
import type { MapOrientation } from "../../features/atlas/types";

export interface AtlasStore {
  selectedEquipmentId: string | null;
  mapOrientation: MapOrientation;
  treeExpanded: Record<string, boolean>;
  mapScale: number;
  selectEquipment: (id: string | null) => void;
  setMapOrientation: (orientation: MapOrientation) => void;
  toggleTreeExpanded: (nodeId: string) => void;
  setTreeExpanded: (nodes: Record<string, boolean>) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

export const useAtlasStore = create<AtlasStore>((set) => ({
  selectedEquipmentId: null,
  mapOrientation: "vertical",
  treeExpanded: { ...DEFAULT_TREE_EXPANDED },
  mapScale: 1,

  selectEquipment: (id) => set({ selectedEquipmentId: id }),

  setMapOrientation: (orientation) => set({ mapOrientation: orientation }),

  toggleTreeExpanded: (nodeId) =>
    set((state) => ({
      treeExpanded: {
        ...state.treeExpanded,
        [nodeId]: !state.treeExpanded[nodeId],
      },
    })),

  setTreeExpanded: (nodes) => set({ treeExpanded: nodes }),

  zoomIn: () => set((s) => ({ mapScale: Math.min(2, s.mapScale + 0.15) })),

  zoomOut: () => set((s) => ({ mapScale: Math.max(0.55, s.mapScale - 0.15) })),

  resetZoom: () => set({ mapScale: 1 }),
}));