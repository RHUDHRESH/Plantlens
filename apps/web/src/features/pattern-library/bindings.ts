/**
 * Role → tag binding review for "Apply to asset". The API binds deterministically and reports
 * ties as `ambiguous`; the engineer resolves them here and we re-preview with explicit bindings.
 */
import type { InstantiationResult } from "../../api/v2";

export type BindingMethod = "explicit" | "tag_map_role" | "signal_type" | "name_hint" | "ambiguous" | "unbound";

export const METHOD_TEXT: Record<BindingMethod, string> = {
  explicit: "Explicit (you chose)",
  tag_map_role: "Tag map role",
  signal_type: "Signal type",
  name_hint: "Name hint",
  ambiguous: "Ambiguous — choose",
  unbound: "No matching tag",
};

export interface BindingRow {
  role: string;
  tagId: string | null;
  method: BindingMethod;
  candidates: string[];
  required: boolean;
  /** The engineer's pending choice for this role (not yet re-previewed). */
  choice: string | null;
}

export function bindingRows(
  result: InstantiationResult,
  requiredRoles: readonly string[],
  choices: Record<string, string>,
): BindingRow[] {
  const required = new Set(requiredRoles);
  return Object.entries(result.bindings)
    .map(([role, b]) => ({
      role,
      tagId: b.tag_id,
      method: (b.method as BindingMethod) ?? "unbound",
      candidates: b.candidates ?? [],
      required: required.has(role),
      choice: choices[role] ?? null,
    }))
    .sort((a, b) => Number(b.required) - Number(a.required) || rank(a.method) - rank(b.method) || a.role.localeCompare(b.role));
}

function rank(m: BindingMethod): number {
  return m === "ambiguous" ? 0 : m === "unbound" ? 2 : 1;
}

export function ambiguousRoles(result: InstantiationResult | null | undefined): string[] {
  if (!result) return [];
  return Object.entries(result.bindings)
    .filter(([, b]) => b.method === "ambiguous")
    .map(([role]) => role);
}

/**
 * Explicit bindings for the next preview: previously explicit bindings are kept (the server
 * only reports them as explicit when we sent them) and new choices override them.
 */
export function explicitBindings(result: InstantiationResult | null | undefined, choices: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  if (result) {
    for (const [role, b] of Object.entries(result.bindings)) {
      if (b.method === "explicit" && b.tag_id) out[role] = b.tag_id;
    }
  }
  for (const [role, tag] of Object.entries(choices)) {
    if (tag) out[role] = tag;
  }
  return out;
}

/** Choices that differ from what the current preview already used. */
export function hasPendingChoices(result: InstantiationResult | null | undefined, choices: Record<string, string>): boolean {
  if (!result) return false;
  return Object.entries(choices).some(([role, tag]) => tag && result.bindings[role]?.tag_id !== tag);
}

export type PreviewState = "gap" | "needs_resolution" | "ready";

/** gap: required roles unobservable; needs_resolution: ambiguous or un-previewed choices; ready: can submit. */
/** Required roles with no candidate tag at all (ambiguous roles are resolvable, not a gap). */
export function unobservableRoles(result: InstantiationResult): string[] {
  return result.missing_required.filter((r) => result.bindings[r]?.method !== "ambiguous");
}

export function previewState(result: InstantiationResult, choices: Record<string, string>): PreviewState {
  if (!result.ok || !result.change_set) {
    if (hasPendingChoices(result, choices)) return "needs_resolution";
    return unobservableRoles(result).length ? "gap" : "needs_resolution";
  }
  if (hasPendingChoices(result, choices)) return "needs_resolution";
  return "ready";
}
