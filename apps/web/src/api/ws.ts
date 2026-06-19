/**
 * Runtime WebSocket — sole writer of live runtime store state.
 * Reconnect uses a single handler set; malformed payloads are ignored.
 */
import { getWsRuntimeUrl } from "./config";
import type { WsRuntimeSnapshotMessage } from "./types";
import { useRuntimeStore } from "../app/store/runtime";

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 500;
const STALE_WATCHDOG_MS = 5_000;

export interface RuntimeSocketHandle {
  close: () => void;
}

function isRuntimeSnapshotMessage(data: unknown): data is WsRuntimeSnapshotMessage {
  if (typeof data !== "object" || data === null) return false;
  const msg = data as Record<string, unknown>;
  if (msg.type !== "runtime.snapshot") return false;
  if (typeof msg.state !== "object" || msg.state === null) return false;
  return true;
}

function isScenarioStateMessage(data: unknown): data is {
  type: "scenario.state";
  scenario_id: string;
  status: string;
  progress?: number;
} {
  if (typeof data !== "object" || data === null) return false;
  const msg = data as Record<string, unknown>;
  return msg.type === "scenario.state" && typeof msg.scenario_id === "string";
}

export function connectRuntimeSocket(): RuntimeSocketHandle {
  const store = useRuntimeStore.getState();
  let ws: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  let lastFrameAt = Date.now();

  const clearTimers = () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (watchdogTimer) clearTimeout(watchdogTimer);
    reconnectTimer = null;
    watchdogTimer = null;
  };

  const scheduleWatchdog = () => {
    if (watchdogTimer) clearTimeout(watchdogTimer);
    watchdogTimer = setTimeout(() => {
      if (closed) return;
      if (Date.now() - lastFrameAt > STALE_WATCHDOG_MS) {
        store.setConnection("stale");
      }
    }, STALE_WATCHDOG_MS + 100);
  };

  const scheduleReconnect = () => {
    if (closed) return;
    const delay = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt);
    attempt += 1;
    store.setConnection("stale");
    reconnectTimer = setTimeout(connect, delay);
  };

  const onMessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(String(event.data)) as unknown;
      if (isScenarioStateMessage(data)) {
        const status = data.status as "started" | "running" | "finished" | "stopped";
        store.setScenarioState({
          scenarioId: data.scenario_id,
          status: status === "finished" || status === "stopped" ? status : status,
          progress: typeof data.progress === "number" ? data.progress : null,
        });
        return;
      }
      if (!isRuntimeSnapshotMessage(data)) return;
      lastFrameAt = Date.now();
      store.applySnapshot(data.state, data.ts);
      store.setConnection("live");
      scheduleWatchdog();
    } catch {
      /* ignore malformed payloads */
    }
  };

  const connect = () => {
    if (closed) return;
    clearTimers();
    store.setConnection("connecting");
    ws = new WebSocket(getWsRuntimeUrl());
    ws.onopen = () => {
      attempt = 0;
      lastFrameAt = Date.now();
      store.setConnection("live");
      scheduleWatchdog();
    };
    ws.onmessage = onMessage;
    ws.onerror = () => {
      store.setConnection("stale");
    };
    ws.onclose = () => {
      ws = null;
      if (!closed) scheduleReconnect();
      else store.setConnection("disconnected");
    };
  };

  connect();

  return {
    close: () => {
      closed = true;
      clearTimers();
      ws?.close();
      ws = null;
      store.setConnection("disconnected");
    },
  };
}