/** API client — REST cold reads + WebSocket live deltas (Domain W). */
import type { CanonicalValue, Situation } from "../store/useStore";

interface StateMsg {
  ts: number;
  degraded: boolean;
  values: CanonicalValue[];
  situations: Situation[];
}

export async function fetchState(): Promise<StateMsg> {
  const r = await fetch("/api/state");
  return r.json();
}

export function connectWs(onMessage: (msg: StateMsg) => void): WebSocket {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws/stream`);
  ws.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data));
    } catch {
      /* ignore malformed frames */
    }
  };
  return ws;
}
