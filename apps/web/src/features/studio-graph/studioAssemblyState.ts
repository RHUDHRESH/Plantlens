import { create } from "zustand";
import type { AssetInstance, PlantAssembly, PlantConnection } from "../../app/schemas/plantAssembly";
import type { ComponentTemplate } from "./componentLibraryTypes";
import { inferConnectionKind } from "./connectionValidation";

const EMPTY_ASSEMBLY: PlantAssembly = {
  assembly_id: "studio_assembly_live",
  plant_id: "plantlens_demo",
  version: "0.1.0",
  assets: [],
  connections: [],
  global_tags: [],
  metadata: { mode: "studio_mvp" },
};

function nextAssetId(componentTypeId: string, assets: AssetInstance[]): string {
  const prefix = `${componentTypeId}_`;
  const existing = assets
    .map((a) => a.asset_id)
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number.parseInt(id.slice(prefix.length), 10))
    .filter((n) => !Number.isNaN(n));
  const next = existing.length ? Math.max(...existing) + 1 : 1;
  return `${componentTypeId}_${next}`;
}

export interface AssemblyStudioState {
  assembly: PlantAssembly;
  library: ComponentTemplate[];
  selectedAssetId: string | null;
  selectedConnectionId: string | null;
  rejectionMessage: string | null;
  setLibrary: (components: ComponentTemplate[]) => void;
  resetAssembly: () => void;
  loadAssembly: (assembly: PlantAssembly) => void;
  addAsset: (template: ComponentTemplate, position: { x: number; y: number }) => string;
  moveAsset: (assetId: string, position: { x: number; y: number }) => void;
  removeAsset: (assetId: string) => void;
  addConnection: (connection: PlantConnection) => void;
  updateConnection: (connectionId: string, patch: Partial<PlantConnection>) => void;
  removeConnection: (connectionId: string) => void;
  selectAsset: (assetId: string | null) => void;
  selectConnection: (connectionId: string | null) => void;
  setRejectionMessage: (message: string | null) => void;
  getTemplate: (componentTypeId: string) => ComponentTemplate | undefined;
}

export const useAssemblyStudioStore = create<AssemblyStudioState>((set, get) => ({
  assembly: structuredClone(EMPTY_ASSEMBLY),
  library: [],
  selectedAssetId: null,
  selectedConnectionId: null,
  rejectionMessage: null,

  setLibrary: (components) => set({ library: components }),

  resetAssembly: () =>
    set({
      assembly: structuredClone(EMPTY_ASSEMBLY),
      selectedAssetId: null,
      selectedConnectionId: null,
      rejectionMessage: null,
    }),

  loadAssembly: (assembly) => set({ assembly: structuredClone(assembly) }),

  addAsset: (template, position) => {
    const { assembly } = get();
    const assetId = nextAssetId(template.component_type_id, assembly.assets);
    const asset: AssetInstance = {
      asset_id: assetId,
      component_type_id: template.component_type_id,
      display_name: template.display_name,
      position_2d: position,
      configured_ports: template.ports.map((p) => p.port_id),
      configured_signals: template.signal_templates.map((s) => s.signal_template_id),
      overrides: {},
      enabled_fault_modes: template.fault_modes.map((f) => f.fault_mode_id),
    };
    set({
      assembly: { ...assembly, assets: [...assembly.assets, asset] },
      selectedAssetId: assetId,
      selectedConnectionId: null,
      rejectionMessage: null,
    });
    return assetId;
  },

  moveAsset: (assetId, position) => {
    const { assembly } = get();
    set({
      assembly: {
        ...assembly,
        assets: assembly.assets.map((asset) =>
          asset.asset_id === assetId ? { ...asset, position_2d: position } : asset,
        ),
      },
    });
  },

  removeAsset: (assetId) => {
    const { assembly } = get();
    set({
      assembly: {
        ...assembly,
        assets: assembly.assets.filter((a) => a.asset_id !== assetId),
        connections: assembly.connections.filter(
          (c) => c.from_asset_id !== assetId && c.to_asset_id !== assetId,
        ),
      },
      selectedAssetId: null,
      selectedConnectionId: null,
    });
  },

  addConnection: (connection) => {
    const { assembly } = get();
    if (assembly.connections.some((c) => c.connection_id === connection.connection_id)) return;
    set({
      assembly: { ...assembly, connections: [...assembly.connections, connection] },
      selectedConnectionId: connection.connection_id,
      selectedAssetId: null,
      rejectionMessage: null,
    });
  },

  updateConnection: (connectionId, patch) => {
    const { assembly } = get();
    set({
      assembly: {
        ...assembly,
        connections: assembly.connections.map((c) =>
          c.connection_id === connectionId ? { ...c, ...patch } : c,
        ),
      },
    });
  },

  removeConnection: (connectionId) => {
    const { assembly } = get();
    set({
      assembly: {
        ...assembly,
        connections: assembly.connections.filter((c) => c.connection_id !== connectionId),
      },
      selectedConnectionId: null,
    });
  },

  selectAsset: (assetId) => set({ selectedAssetId: assetId, selectedConnectionId: null }),
  selectConnection: (connectionId) => set({ selectedConnectionId: connectionId, selectedAssetId: null }),
  setRejectionMessage: (message) => set({ rejectionMessage: message }),

  getTemplate: (componentTypeId) => get().library.find((c) => c.component_type_id === componentTypeId),
}));

export function buildConnectionFromPorts(
  fromAssetId: string,
  fromPortId: string,
  toAssetId: string,
  toPortId: string,
  medium: string,
  existingCount: number,
): PlantConnection {
  return {
    connection_id: `C${String(existingCount + 1).padStart(3, "0")}`,
    from_asset_id: fromAssetId,
    from_port_id: fromPortId,
    to_asset_id: toAssetId,
    to_port_id: toPortId,
    connection_kind: inferConnectionKind(medium),
    approved: true,
    lag_min_ms: 0,
    lag_max_ms: 200,
    notes: "",
  };
}