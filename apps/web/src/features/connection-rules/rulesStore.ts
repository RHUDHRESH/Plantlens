/**
 * Connection rules: fetch/save (GET/PUT /api/studio/connection-rules/{plant}) + the working copy.
 * Revision 0 on the server means "never authored": the client uses the built-in defaults.
 */
import { create } from "zustand";
import { apiFetch } from "../../api/client";
import { ApiError } from "../../api/types";
import { defaultRuleSet } from "./defaults";
import { normalizeRuleSet } from "./schema";
import type { ConnectionRuleSet } from "./types";

export interface RulesResponse {
  plant_id: string;
  revision: number;
  rules: ConnectionRuleSet | null;
}

export const getConnectionRules = (plantId: string, signal?: AbortSignal) =>
  apiFetch<RulesResponse>(`/api/studio/connection-rules/${encodeURIComponent(plantId)}`, { signal });

export const putConnectionRules = (plantId: string, rules: ConnectionRuleSet, baseRevision?: number) =>
  apiFetch<RulesResponse>(`/api/studio/connection-rules/${encodeURIComponent(plantId)}`, {
    method: "PUT",
    body: baseRevision === undefined ? { rules } : { rules, base_revision: baseRevision },
  });

type Status = "idle" | "loading" | "ready" | "saving" | "error";

interface RulesState {
  /** Rules the canvas enforces (saved or not — edits apply immediately while you author). */
  rules: ConnectionRuleSet;
  /** Last saved/loaded copy, to compute dirty and to discard. */
  saved: ConnectionRuleSet;
  revision: number;
  status: Status;
  error: { message: string; fix?: string | undefined } | null;
  conflictRevision: number | null;
  setRules: (updater: (rules: ConnectionRuleSet) => ConnectionRuleSet) => void;
  replaceRules: (rules: ConnectionRuleSet) => void;
  discard: () => void;
  resetToDefaults: () => void;
  load: (plantId: string) => Promise<void>;
  save: (plantId: string, opts?: { overwrite?: boolean }) => Promise<boolean>;
}

export const useRulesStore = create<RulesState>((set, get) => ({
  rules: defaultRuleSet(),
  saved: defaultRuleSet(),
  revision: 0,
  status: "idle",
  error: null,
  conflictRevision: null,

  setRules: (updater) => set({ rules: updater(structuredClone(get().rules)) }),
  replaceRules: (rules) => set({ rules }),
  discard: () => set({ rules: structuredClone(get().saved), error: null }),
  resetToDefaults: () => set({ rules: defaultRuleSet() }),

  load: async (plantId) => {
    set({ status: "loading", error: null });
    try {
      const res = await getConnectionRules(plantId);
      const parsed = res.rules ? normalizeRuleSet(res.rules) : null;
      const rules = parsed?.ok ? parsed.rules : defaultRuleSet();
      set({ rules, saved: structuredClone(rules), revision: res.revision, status: "ready", conflictRevision: null });
    } catch (err) {
      set({ status: "error", error: toError(err) });
    }
  },

  save: async (plantId, opts) => {
    const { rules, revision, conflictRevision } = get();
    set({ status: "saving", error: null });
    try {
      const base = opts?.overwrite ? (conflictRevision ?? revision) : revision;
      const res = await putConnectionRules(plantId, rules, base);
      const next = res.rules ?? rules;
      set({ rules: next, saved: structuredClone(next), revision: res.revision, status: "ready", conflictRevision: null });
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const current = (err.body as { current_revision?: number }).current_revision ?? null;
        set({ status: "ready", conflictRevision: current, error: { message: "Someone else saved rules since you loaded them.", fix: "Reload theirs, or overwrite with yours." } });
      } else {
        set({ status: "error", error: toError(err) });
      }
      return false;
    }
  },
}));

function toError(err: unknown): { message: string; fix?: string | undefined } {
  if (err instanceof ApiError) return { message: err.body.message, fix: err.body.fix };
  return { message: err instanceof Error ? err.message : "Request failed" };
}

export function isRulesDirty(state: Pick<RulesState, "rules" | "saved">): boolean {
  return JSON.stringify(state.rules) !== JSON.stringify(state.saved);
}
