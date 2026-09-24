/**
 * TanStack Query hooks for the v2 surface. Keys are centralised so mutations invalidate the
 * right views (e.g. approving a change refreshes approvals, revisions and the causal graph).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../app/session";
import * as v2 from "./v2";

export const qk = {
  changes: (status?: string) => ["changes", status ?? "all"] as const,
  change: (id: string) => ["change", id] as const,
  active: ["active-revision"] as const,
  revisions: ["revisions"] as const,
  patternLibraries: ["pattern-libraries"] as const,
  pattern: (id: string) => ["pattern", id] as const,
  coverage: (assetId: string) => ["coverage", assetId] as const,
  trends: (tags: string[], seconds: number) => ["trends", tags.join(","), seconds] as const,
  alarmRules: ["alarm-rules"] as const,
  shelved: ["shelved"] as const,
  causalGraph: ["causal-graph"] as const,
  layout: (plantId: string) => ["studio-layout", plantId] as const,
  runtimeActions: (situationId: string | null, role: string, alarmKey: string) =>
    ["runtime-actions", situationId ?? "", role, alarmKey] as const,
};

function useReady(): boolean {
  return useSession((s) => s.status === "ready");
}

export function useChanges(status?: v2.ChangeStatus) {
  const ready = useReady();
  return useQuery({ queryKey: qk.changes(status), queryFn: ({ signal }) => v2.listChanges(status, signal), enabled: ready });
}

export function useChange(id: string | null) {
  const ready = useReady();
  return useQuery({
    queryKey: qk.change(id ?? ""),
    queryFn: ({ signal }) => v2.getChange(id!, signal),
    enabled: ready && !!id,
  });
}

export function useActiveRevision() {
  const ready = useReady();
  return useQuery({ queryKey: qk.active, queryFn: ({ signal }) => v2.getActiveRevision(signal), enabled: ready, refetchInterval: 15_000 });
}

export function useRevisions() {
  const ready = useReady();
  return useQuery({ queryKey: qk.revisions, queryFn: ({ signal }) => v2.listRevisions(signal), enabled: ready });
}

export function useReviewChange() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; decision: "approve" | "reject"; comment: string; approve_edges?: boolean }) =>
      v2.reviewChange(args.id, { decision: args.decision, comment: args.comment, approve_edges: args.approve_edges }),
    onSettled: () => {
      for (const key of [["changes"], ["change"], qk.active, qk.revisions, qk.causalGraph, qk.alarmRules]) {
        void client.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useRollback() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { toRev: number; comment: string }) => v2.rollbackTo(args.toRev, args.comment),
    onSettled: () => {
      for (const key of [qk.active, qk.revisions, qk.causalGraph, qk.alarmRules]) {
        void client.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function usePatternLibraries() {
  const ready = useReady();
  return useQuery({ queryKey: qk.patternLibraries, queryFn: ({ signal }) => v2.listPatternLibraries(signal), enabled: ready, staleTime: 300_000 });
}

export function usePattern(id: string | null) {
  const ready = useReady();
  return useQuery({ queryKey: qk.pattern(id ?? ""), queryFn: ({ signal }) => v2.getPattern(id!, signal), enabled: ready && !!id, staleTime: 300_000 });
}

export function useCoverage(assetId: string | null) {
  const ready = useReady();
  return useQuery({ queryKey: qk.coverage(assetId ?? ""), queryFn: ({ signal }) => v2.getCoverage(assetId!, signal), enabled: ready && !!assetId });
}

export function useInstantiatePattern() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { patternId: string; assetId: string; bindings?: Record<string, string>; submit?: boolean }) =>
      v2.instantiatePattern(args.patternId, { asset_id: args.assetId, bindings: args.bindings, submit: args.submit }),
    onSuccess: (data) => {
      if (data.change) void client.invalidateQueries({ queryKey: ["changes"] });
    },
  });
}

export function useTrends(tagIds: string[], seconds: number, refetchMs = 2_000) {
  const ready = useReady();
  return useQuery({
    queryKey: qk.trends(tagIds, seconds),
    queryFn: ({ signal }) => v2.getTrends(tagIds, seconds, signal),
    enabled: ready && tagIds.length > 0,
    refetchInterval: refetchMs,
  });
}

export function useAlarmRules() {
  const ready = useReady();
  return useQuery({ queryKey: qk.alarmRules, queryFn: ({ signal }) => v2.getAlarmRules(signal), enabled: ready, staleTime: 60_000 });
}

export function useShelvedAlarms() {
  const ready = useReady();
  return useQuery({ queryKey: qk.shelved, queryFn: ({ signal }) => v2.getShelvedAlarms(signal), enabled: ready, refetchInterval: 5_000 });
}

export function useShelveAlarm() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { alarmId: string; durationS: number; reason: string }) =>
      v2.shelveAlarm(args.alarmId, args.durationS, args.reason),
    onSettled: () => void client.invalidateQueries({ queryKey: qk.shelved }),
  });
}

export function useUnshelveAlarm() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (alarmId: string) => v2.unshelveAlarm(alarmId),
    onSettled: () => void client.invalidateQueries({ queryKey: qk.shelved }),
  });
}

/**
 * Role-gated advisory actions for one situation. The key carries the situation, the role and the
 * active alarm set, so it refetches whenever the situation changes or a blocking alarm clears.
 */
export function useRuntimeActions(situationId: string | null, alarmKey = "") {
  const ready = useReady();
  const role = useSession((s) => s.role);
  return useQuery({
    queryKey: qk.runtimeActions(situationId, role, alarmKey),
    queryFn: ({ signal }) => v2.getRuntimeActions(situationId, signal),
    enabled: ready && !!situationId,
    staleTime: 2_000,
  });
}

export function useCausalGraph() {
  const ready = useReady();
  return useQuery({ queryKey: qk.causalGraph, queryFn: ({ signal }) => v2.getCausalGraph(signal), enabled: ready, refetchInterval: 3_000 });
}

export function useAudit(action?: string, entityId?: string) {
  const ready = useReady();
  return useQuery({
    queryKey: ["audit", action ?? "", entityId ?? ""],
    queryFn: ({ signal }) => v2.getAudit({ action, entityId }, signal),
    enabled: ready,
    refetchInterval: 10_000,
  });
}
