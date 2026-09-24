/**
 * Read-only engineering data shared by the engineer/admin workspaces: the compiled bundle's
 * asset and tag indexes (asset pickers, units for alarm-rule text) and revision snapshots/diffs.
 */
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { apiFetch, getCompiledBundle } from "../../api/client";
import { useAlarmRules, useCausalGraph } from "../../api/queries";
import type { EntityDiff, RevisionSummary } from "../../api/v2";
import { useSession } from "../../app/session";

export interface AssetInfo {
  id: string;
  display_name?: string;
  type?: string;
  area_id?: string;
  criticality?: string;
}

export interface TagInfo {
  tag: string;
  asset_id?: string;
  unit?: string;
  signal_type?: string;
  role?: string;
}

interface CompiledIndexes {
  asset_index?: Record<string, AssetInfo>;
  tag_index?: Record<string, TagInfo>;
}

function useReady(): boolean {
  return useSession((s) => s.status === "ready");
}

export function useCompiledIndexes() {
  const ready = useReady();
  return useQuery({
    queryKey: ["compiled-bundle", "indexes"],
    queryFn: async ({ signal }) => {
      const bundle = (await getCompiledBundle(signal)) as unknown as CompiledIndexes;
      return {
        assets: Object.values(bundle.asset_index ?? {}).sort((a, b) => a.id.localeCompare(b.id)),
        tags: bundle.tag_index ?? {},
      };
    },
    enabled: ready,
    staleTime: 60_000,
  });
}

/** Unit lookup for alarm-rule text ("> 3.4 A"). Returns undefined while loading. */
export function useUnitFor(): (tag: string) => string | undefined {
  const { data } = useCompiledIndexes();
  const tags = data?.tags;
  return useCallback((tag: string) => tags?.[tag]?.unit, [tags]);
}

/**
 * Resolves the current alarm rule / causal edge for a field-level diff entry, so "changed" rows
 * can still be described as "MOTOR_301_CURRENT > 3.2 A for 1.5 s" or "A → B · lag …".
 */
export function useEntityLookup(): (entry: EntityDiff) => Record<string, unknown> | undefined {
  const rules = useAlarmRules();
  const graph = useCausalGraph();
  const ruleMap = useMemo(() => new Map((rules.data?.rules ?? []).map((r) => [r.id, r])), [rules.data]);
  const edgeMap = useMemo(() => new Map((graph.data?.edges ?? []).map((e) => [e.id, e])), [graph.data]);
  return useCallback(
    (entry: EntityDiff) => {
      if (entry.doc === "alarm_rules") return ruleMap.get(entry.id) as unknown as Record<string, unknown> | undefined;
      if (entry.collection === "edges") return edgeMap.get(entry.id) as unknown as Record<string, unknown> | undefined;
      return undefined;
    },
    [ruleMap, edgeMap],
  );
}

export function assetLabel(asset: AssetInfo | undefined, fallback: string): string {
  if (!asset) return fallback;
  return asset.display_name ? `${asset.id} · ${asset.display_name}` : asset.id;
}

// ---- Revision snapshots (GET /api/changes/revisions/{rev}[/diff/{b}]) ----------------------

export interface RevisionDetail extends RevisionSummary {
  deployed_by?: string | null;
}

export const getRevisionBundle = (rev: number, signal?: AbortSignal) =>
  apiFetch<{ revision: RevisionDetail; bundle: Record<string, unknown> }>(`/api/changes/revisions/${rev}`, { signal });

export const getRevisionDiff = (fromRev: number, toRev: number, signal?: AbortSignal) =>
  apiFetch<{ from: RevisionDetail; to: RevisionDetail; identical: boolean; diff: EntityDiff[] }>(
    `/api/changes/revisions/${fromRev}/diff/${toRev}`,
    { signal },
  );

export function useRevisionDiff(fromRev: number | null, toRev: number | null) {
  const ready = useReady();
  return useQuery({
    queryKey: ["revision-diff", fromRev ?? 0, toRev ?? 0],
    queryFn: ({ signal }) => getRevisionDiff(fromRev!, toRev!, signal),
    enabled: ready && fromRev != null && toRev != null,
    staleTime: Infinity, // revisions are immutable
    retry: false,
  });
}
