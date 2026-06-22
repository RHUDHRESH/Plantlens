import { create } from "zustand";
import { getInitialStudioDraftBundle } from "./demoBundleLoader";
import { validateDraftBundle } from "./studioDraftSchema";
import type {
  StudioDraftBundle,
  StudioDraftFamily,
  StudioDraftPatch,
  StudioDraftState,
  StudioDraftStatus,
} from "./studioDraftTypes";

const EMPTY_DIRTY: Record<StudioDraftFamily, boolean> = {
  plant: false,
  tag_map: false,
  alarm_rules: false,
  causal_graph: false,
  action_envelope: false,
};

function cloneBundle(bundle: StudioDraftBundle): StudioDraftBundle {
  return JSON.parse(JSON.stringify(bundle)) as StudioDraftBundle;
}

function deriveStatus(
  dirtyFamilies: Record<StudioDraftFamily, boolean>,
  issues: StudioDraftState["issues"],
): StudioDraftStatus {
  if (issues.some((i) => i.severity === "error")) return "invalid";
  if (Object.values(dirtyFamilies).some(Boolean)) return "dirty";
  return "clean";
}

export interface StudioDraftStore extends StudioDraftState {
  loaded: boolean;
  loadInitialBundle: () => void;
  selectTarget: (family: StudioDraftFamily, targetId: string | null) => void;
  applyPatch: (patch: StudioDraftPatch) => void;
  resetDraft: () => void;
  validateDraft: () => void;
  markFamilyDirty: (family: StudioDraftFamily) => void;
  clearSelection: () => void;
  getAuthoredBundleInput: () => StudioDraftBundle | null;
  getDraftSnapshot: () => StudioDraftState;
}

export const useStudioDraftStore = create<StudioDraftStore>((set, get) => ({
  loaded: false,
  bundle: getInitialStudioDraftBundle(),
  status: "clean",
  selectedFamily: null,
  selectedTargetId: null,
  issues: [],
  dirtyFamilies: { ...EMPTY_DIRTY },
  lastValidatedAt: null,

  loadInitialBundle: () => {
    const bundle = cloneBundle(getInitialStudioDraftBundle());
    const issues = validateDraftBundle(bundle);
    set({
      loaded: true,
      bundle,
      status: deriveStatus({ ...EMPTY_DIRTY }, issues),
      selectedFamily: null,
      selectedTargetId: null,
      issues,
      dirtyFamilies: { ...EMPTY_DIRTY },
      lastValidatedAt: new Date().toISOString(),
    });
  },

  selectTarget: (family, targetId) => {
    set({ selectedFamily: family, selectedTargetId: targetId });
  },

  applyPatch: (patch) => {
    const current = get();
    const nextBundle = patch.apply(cloneBundle(current.bundle));
    const dirtyFamilies = { ...current.dirtyFamilies, [patch.family]: true };
    const issues = validateDraftBundle(nextBundle);
    set({
      bundle: nextBundle,
      dirtyFamilies,
      issues,
      status: deriveStatus(dirtyFamilies, issues),
      selectedFamily: patch.family,
      selectedTargetId: patch.targetId,
    });
  },

  resetDraft: () => {
    const bundle = cloneBundle(getInitialStudioDraftBundle());
    const issues = validateDraftBundle(bundle);
    set({
      bundle,
      status: "clean",
      selectedFamily: null,
      selectedTargetId: null,
      issues,
      dirtyFamilies: { ...EMPTY_DIRTY },
      lastValidatedAt: new Date().toISOString(),
    });
  },

  validateDraft: () => {
    const { bundle, dirtyFamilies } = get();
    const issues = validateDraftBundle(bundle);
    set({
      issues,
      status: deriveStatus(dirtyFamilies, issues),
      lastValidatedAt: new Date().toISOString(),
    });
  },

  markFamilyDirty: (family) => {
    const dirtyFamilies = { ...get().dirtyFamilies, [family]: true };
    set({
      dirtyFamilies,
      status: deriveStatus(dirtyFamilies, get().issues),
    });
  },

  clearSelection: () => {
    set({ selectedFamily: null, selectedTargetId: null });
  },

  getAuthoredBundleInput: () => {
    const { loaded, bundle } = get();
    if (!loaded) return null;
    return cloneBundle(bundle);
  },

  getDraftSnapshot: () => {
    const { bundle, status, selectedFamily, selectedTargetId, issues, dirtyFamilies, lastValidatedAt } =
      get();
    return {
      bundle: cloneBundle(bundle),
      status,
      selectedFamily,
      selectedTargetId,
      issues: [...issues],
      dirtyFamilies: { ...dirtyFamilies },
      lastValidatedAt,
    };
  },
}));

export function resetStudioDraftStoreForTests() {
  const bundle = cloneBundle(getInitialStudioDraftBundle());
  const issues = validateDraftBundle(bundle);
  useStudioDraftStore.setState({
    loaded: false,
    bundle,
    status: "clean",
    selectedFamily: null,
    selectedTargetId: null,
    issues,
    dirtyFamilies: { ...EMPTY_DIRTY },
    lastValidatedAt: null,
  });
}