/** Audit ledger view helpers: action-prefix filters, paging, entity links. */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getAudit } from "../../api/v2";
import type { AuditRecord } from "../../api/v2";
import { useSession } from "../../app/session";

export const ACTION_PREFIXES = [
  { prefix: "change.", label: "Changes" },
  { prefix: "bundle.", label: "Bundles" },
  { prefix: "runtime.", label: "Runtime" },
  { prefix: "alarm.", label: "Alarms" },
  { prefix: "agent.", label: "Agents" },
  { prefix: "incident.", label: "Incidents" },
] as const;

export const PAGE_SIZES = [25, 50, 100] as const;

export interface AuditQueryState {
  action: string | null;
  entityId: string;
  limit: number;
  offset: number;
}

/** Toggle a prefix chip; changing the filter always returns to the first page. */
export function togglePrefix(state: AuditQueryState, prefix: string): AuditQueryState {
  return { ...state, action: state.action === prefix ? null : prefix, offset: 0 };
}

export function setEntity(state: AuditQueryState, entityId: string): AuditQueryState {
  return { ...state, entityId, offset: 0 };
}

export function setPageSize(state: AuditQueryState, limit: number): AuditQueryState {
  return { ...state, limit, offset: 0 };
}

export interface PageInfo {
  page: number;
  pages: number;
  from: number;
  to: number;
  hasPrev: boolean;
  hasNext: boolean;
}

export function pageInfo(total: number, limit: number, offset: number): PageInfo {
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(pages, Math.floor(offset / limit) + 1);
  return {
    page,
    pages,
    from: total ? offset + 1 : 0,
    to: Math.min(total, offset + limit),
    hasPrev: offset > 0,
    hasNext: offset + limit < total,
  };
}

export function nextOffset(state: AuditQueryState, total: number): number {
  return state.offset + state.limit < total ? state.offset + state.limit : state.offset;
}

export function prevOffset(state: AuditQueryState): number {
  return Math.max(0, state.offset - state.limit);
}

/** Where a record's entity lives in the app, when there is a view for it. */
export function entityHref(record: Pick<AuditRecord, "entity_type" | "entity_id">): string | null {
  if (!record.entity_id) return null;
  if (record.entity_type === "change_request") return `/eng/approvals/${encodeURIComponent(record.entity_id)}`;
  if (record.entity_type === "bundle_revision") return `/admin/revisions?rev=${encodeURIComponent(record.entity_id)}`;
  if (record.entity_type === "incident") return `/ops/incidents`;
  return null;
}

export function truncateHash(hash: string | null | undefined, head = 8, tail = 6): string {
  if (!hash) return "—";
  return hash.length <= head + tail + 1 ? hash : `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

export function useAuditPage(state: AuditQueryState) {
  const ready = useSession((s) => s.status === "ready");
  return useQuery({
    queryKey: ["audit", state.action ?? "", state.entityId, state.limit, state.offset],
    queryFn: ({ signal }) =>
      getAudit({ action: state.action ?? undefined, entityId: state.entityId || undefined, limit: state.limit, offset: state.offset }, signal),
    enabled: ready,
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });
}
