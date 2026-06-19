/**
 * Studio authoring store — canonical JSON bundle (forms are source of truth).
 * Separate from live runtime store (Zustand) and REST cache (TanStack Query).
 */
import { create } from "zustand";
import type { AlarmRule } from "../schemas/alarm";

export interface PlantAsset {
  id: string;
  type: string;
  display_name: string;
  area_id?: string;
  parent_asset_id?: string | null;
  criticality?: "low" | "medium" | "high";
  coords_2d?: { x: number; y: number };
  coords_3d?: { x: number; y: number; z: number; model?: string };
}

export interface PlantConnection {
  from: string;
  to: string;
  kind?: "power" | "signal" | "cooling" | "process";
}

export interface TagEntry {
  tag: string;
  asset_id: string;
  source_id: string;
  signal_type: string;
  unit: string;
}

export interface CausalEdge {
  id: string;
  from: string;
  to: string;
  edge_type: string;
  approved: boolean;
  lag_ms: [number, number];
  weight?: number;
  confidence?: number;
  provenance: string;
}

export interface StudioAction {
  id: string;
  label: string;
  action_code: number;
  allowed_roles: string[];
  risk_level: string;
  target_asset_id?: string;
}

export interface AuthoredBundle {
  plant: {
    plant_id: string;
    name: string;
    version: string;
    assets: PlantAsset[];
    connections: PlantConnection[];
    roles?: string[];
  };
  tag_map: { version: string; tags: TagEntry[] };
  alarm_rules: { version: string; rules: AlarmRule[] };
  causal_graph: {
    version: string;
    graph_id: string;
    nodes: Array<{ id: string; kind: string; label?: string }>;
    edges: CausalEdge[];
  };
  action_envelope: { actions: StudioAction[] };
}

export interface ValidationIssue {
  code?: string;
  severity?: string;
  message: string;
  fix: string;
  field?: string | null;
  entity_id?: string | null;
}

export interface StudioStore {
  bundle: AuthoredBundle | null;
  lastCompileHash: string | null;
  compilePreview: AuthoredBundle["plant"] | null;
  validationIssues: ValidationIssue[];
  setBundle: (bundle: AuthoredBundle) => void;
  updateAsset: (index: number, asset: PlantAsset) => void;
  addAsset: (asset: PlantAsset) => void;
  updateTag: (index: number, tag: TagEntry) => void;
  addTag: (tag: TagEntry) => void;
  updateAlarm: (index: number, rule: AlarmRule) => void;
  addAlarm: (rule: AlarmRule) => void;
  updateEdge: (index: number, edge: CausalEdge) => void;
  addEdge: (edge: CausalEdge) => void;
  setNodePosition: (assetId: string, position: { x: number; y: number }) => void;
  toggleEdgeApproved: (edgeId: string, approved: boolean) => void;
  setValidationIssues: (issues: ValidationIssue[]) => void;
  setLastCompileHash: (hash: string | null) => void;
  toCanonicalJson: () => AuthoredBundle | null;
}

export const useStudioStore = create<StudioStore>((set, get) => ({
  bundle: null,
  lastCompileHash: null,
  compilePreview: null,
  validationIssues: [],
  setBundle: (bundle) => set({ bundle }),
  updateAsset: (index, asset) =>
    set((s) => {
      if (!s.bundle) return s;
      const assets = [...s.bundle.plant.assets];
      assets[index] = asset;
      return { bundle: { ...s.bundle, plant: { ...s.bundle.plant, assets } } };
    }),
  addAsset: (asset) =>
    set((s) => {
      if (!s.bundle) return s;
      return {
        bundle: {
          ...s.bundle,
          plant: { ...s.bundle.plant, assets: [...s.bundle.plant.assets, asset] },
        },
      };
    }),
  updateTag: (index, tag) =>
    set((s) => {
      if (!s.bundle) return s;
      const tags = [...s.bundle.tag_map.tags];
      tags[index] = tag;
      return { bundle: { ...s.bundle, tag_map: { ...s.bundle.tag_map, tags } } };
    }),
  addTag: (tag) =>
    set((s) => {
      if (!s.bundle) return s;
      return {
        bundle: {
          ...s.bundle,
          tag_map: { ...s.bundle.tag_map, tags: [...s.bundle.tag_map.tags, tag] },
        },
      };
    }),
  updateAlarm: (index, rule) =>
    set((s) => {
      if (!s.bundle) return s;
      const rules = [...s.bundle.alarm_rules.rules];
      rules[index] = rule;
      return { bundle: { ...s.bundle, alarm_rules: { ...s.bundle.alarm_rules, rules } } };
    }),
  addAlarm: (rule) =>
    set((s) => {
      if (!s.bundle) return s;
      return {
        bundle: {
          ...s.bundle,
          alarm_rules: {
            ...s.bundle.alarm_rules,
            rules: [...s.bundle.alarm_rules.rules, rule],
          },
        },
      };
    }),
  updateEdge: (index, edge) =>
    set((s) => {
      if (!s.bundle) return s;
      const edges = [...s.bundle.causal_graph.edges];
      edges[index] = edge;
      return { bundle: { ...s.bundle, causal_graph: { ...s.bundle.causal_graph, edges } } };
    }),
  addEdge: (edge) =>
    set((s) => {
      if (!s.bundle) return s;
      return {
        bundle: {
          ...s.bundle,
          causal_graph: {
            ...s.bundle.causal_graph,
            edges: [...s.bundle.causal_graph.edges, edge],
          },
        },
      };
    }),
  setNodePosition: (assetId, position) =>
    set((s) => {
      if (!s.bundle) return s;
      const assets = s.bundle.plant.assets.map((a) =>
        a.id === assetId ? { ...a, coords_2d: position } : a,
      );
      return { bundle: { ...s.bundle, plant: { ...s.bundle.plant, assets } } };
    }),
  toggleEdgeApproved: (edgeId, approved) =>
    set((s) => {
      if (!s.bundle) return s;
      const edges = s.bundle.causal_graph.edges.map((e) =>
        e.id === edgeId ? { ...e, approved } : e,
      );
      return { bundle: { ...s.bundle, causal_graph: { ...s.bundle.causal_graph, edges } } };
    }),
  setValidationIssues: (validationIssues) => set({ validationIssues }),
  setLastCompileHash: (lastCompileHash) => set({ lastCompileHash }),
  toCanonicalJson: () => get().bundle,
}));