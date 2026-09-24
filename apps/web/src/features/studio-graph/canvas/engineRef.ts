/**
 * The rule engine is read imperatively (from a stable ref) by nodes while a connection is dragged,
 * so assembly edits don't force all 200 nodes to re-render through context.
 */
import { createContext, useContext, type MutableRefObject } from "react";
import { create } from "zustand";
import type { EngineContext } from "../../connection-rules/engine";
import type { ConnectionRuleSet } from "../../connection-rules/types";

export interface EngineSnapshot {
  ctx: EngineContext;
  rules: ConnectionRuleSet;
  /** Edge whose endpoint is being dragged (reconnect): evaluated as if it did not exist. */
  reconnectingEdgeId: string | null;
  readOnly: boolean;
}

export const EngineRefContext = createContext<MutableRefObject<EngineSnapshot | null> | null>(null);

export function useEngineRef(): MutableRefObject<EngineSnapshot | null> {
  const ref = useContext(EngineRefContext);
  if (!ref) throw new Error("EngineRefContext missing");
  return ref;
}

export interface HoveredPort {
  nodeId: string;
  portId: string;
}

/** Which port handle the pointer is over (drives the single shared port tooltip). */
export const useHoverStore = create<{ port: HoveredPort | null; set: (p: HoveredPort | null) => void }>((set) => ({
  port: null,
  set: (port) => set({ port }),
}));
