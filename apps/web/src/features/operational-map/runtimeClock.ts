/**
 * Runtime clock (docs/ALGORITHMS.md §0). Alarm onsets, trends and ages are stamped with the
 * runtime's evaluation clock, which follows scenario time during replay and can differ from the
 * browser's wall clock. We estimate the offset from the API's `now` and tick locally.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { apiFetch } from "../../api/client";
import { useSession } from "../../app/session";

interface ClockState {
  offsetMs: number;
  synced: boolean;
  setOffset: (offsetMs: number) => void;
}

export const useRuntimeClockStore = create<ClockState>((set) => ({
  offsetMs: 0,
  synced: false,
  setOffset: (offsetMs) => set({ offsetMs, synced: true }),
}));

/** Offset = server runtime "now" minus the local midpoint of the request (half RTT corrected). */
export function computeClockOffset(serverNowIso: string, sentAt: number, receivedAt: number): number | null {
  const server = Date.parse(serverNowIso);
  if (!Number.isFinite(server)) return null;
  return server - (sentAt + receivedAt) / 2;
}

async function fetchRuntimeNow(signal?: AbortSignal): Promise<{ offset: number | null }> {
  const sentAt = Date.now();
  // An empty tag list returns only the runtime clock; it is the cheapest read the API offers.
  const res = await apiFetch<{ now: string }>("/api/runtime/trends?tag_ids=,&seconds=10", { signal });
  return { offset: computeClockOffset(res.now, sentAt, Date.now()) };
}

/** Keep the runtime clock offset fresh. Safe to call from several pages (query is shared). */
export function useRuntimeClockSync(intervalMs = 10_000) {
  const ready = useSession((s) => s.status === "ready");
  const setOffset = useRuntimeClockStore((s) => s.setOffset);
  const query = useQuery({
    queryKey: ["runtime-clock"],
    queryFn: ({ signal }) => fetchRuntimeNow(signal),
    enabled: ready,
    refetchInterval: intervalMs,
  });
  useEffect(() => {
    if (query.data?.offset != null) setOffset(query.data.offset);
  }, [query.data, setOffset]);
}

export function runtimeNow(): number {
  return Date.now() + useRuntimeClockStore.getState().offsetMs;
}

/** Ticking runtime "now" in epoch ms. Re-renders the caller every `tickMs`. */
export function useRuntimeNow(tickMs = 1000): number {
  const offset = useRuntimeClockStore((s) => s.offsetMs);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), tickMs);
    return () => window.clearInterval(id);
  }, [tickMs]);
  return now + offset;
}
