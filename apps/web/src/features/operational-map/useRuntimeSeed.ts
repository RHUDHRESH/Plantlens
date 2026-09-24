import { useEffect } from "react";
import { getRuntimeSnapshot } from "../../api/client";
import { useSession } from "../../app/session";
import { useRuntimeStore } from "../../app/store/runtime";
import { useRuntimeClockSync } from "./runtimeClock";

/**
 * The runtime socket pushes only on change, so a freshly opened page seeds the store from the
 * REST snapshot (and re-seeds after a reconnect). The socket remains the only live writer.
 */
export function useRuntimeSeed() {
  const ready = useSession((s) => s.status === "ready");
  const connection = useRuntimeStore((s) => s.connection);
  useEffect(() => {
    if (!ready) return;
    const ctrl = new AbortController();
    const before = useRuntimeStore.getState().lastSnapshotTs;
    getRuntimeSnapshot(ctrl.signal)
      .then((snap) => {
        const store = useRuntimeStore.getState();
        // Never overwrite a newer socket push that arrived while the request was in flight.
        if (ctrl.signal.aborted || (store.hasSnapshot && store.lastSnapshotTs !== before)) return;
        store.applySnapshot(snap, before ?? undefined);
      })
      .catch(() => {
        /* the connection chip in the shell already reports API problems */
      });
    return () => ctrl.abort();
  }, [ready, connection === "live"]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Everything an operate page needs from the runtime: a seeded store and the runtime clock. */
export function useOperateRuntime() {
  useRuntimeSeed();
  useRuntimeClockSync();
}
