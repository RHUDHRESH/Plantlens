/** Pure wiring between xyflow connection callbacks and the rule engine (unit-tested). */
import type { Connection, Edge } from "@xyflow/react";
import { bestPortForDrop, evaluateConnection, primaryReason } from "../../connection-rules/engine";
import type { Evaluation } from "../../connection-rules/types";
import type { EngineSnapshot } from "./engineRef";

type Ref = { current: EngineSnapshot | null };

export function evaluateFlowConnection(snap: EngineSnapshot, c: Connection | Edge): Evaluation | null {
  if (!c.source || !c.target || !c.sourceHandle || !c.targetHandle) return null;
  return evaluateConnection(
    snap.ctx,
    snap.rules,
    { fromAssetId: c.source, fromPortId: c.sourceHandle, toAssetId: c.target, toPortId: c.targetHandle },
    { ignoreConnectionId: snap.reconnectingEdgeId },
  );
}

/** xyflow `isValidConnection`: synchronous, called on every pointer move over a handle. */
export function makeIsValidConnection(ref: Ref) {
  return (c: Connection | Edge): boolean => {
    const snap = ref.current;
    if (!snap || snap.readOnly) return false;
    const evaluation = evaluateFlowConnection(snap, c);
    return !!evaluation && evaluation.verdict !== "deny";
  };
}

export type ConnectOutcome =
  | { kind: "created"; evaluation: Evaluation }
  | { kind: "rejected"; evaluation: Evaluation | null; message: string; fix: string }
  | { kind: "ignored" };

/** A connection released on a handle. Deny never creates an edge; warn creates it with a badge. */
export function decideConnect(snap: EngineSnapshot | null, c: Connection): ConnectOutcome {
  if (!snap || snap.readOnly) return { kind: "ignored" };
  const evaluation = evaluateFlowConnection(snap, c);
  if (!evaluation) return { kind: "ignored" };
  if (evaluation.verdict === "deny") {
    const r = primaryReason(evaluation);
    return { kind: "rejected", evaluation, message: r?.message ?? "Connection not allowed.", fix: r?.fix ?? "" };
  }
  return { kind: "created", evaluation };
}

/** A connection released on a node body (not a handle): auto-pick the best compatible port. */
export function decideDropOnNode(snap: EngineSnapshot | null, fromNodeId: string, fromHandleId: string, targetNodeId: string): ConnectOutcome {
  if (!snap || snap.readOnly || fromNodeId === targetNodeId) return { kind: "ignored" };
  const choice = bestPortForDrop(snap.ctx, snap.rules, fromNodeId, fromHandleId, targetNodeId);
  if (choice.portId && choice.evaluation) return { kind: "created", evaluation: choice.evaluation };
  const r = choice.evaluation ? primaryReason(choice.evaluation) : null;
  return {
    kind: "rejected",
    evaluation: choice.evaluation,
    message: r ? `No compatible port: ${r.message}` : "That component has no compatible port.",
    fix: r?.fix ?? "Drop on a port highlighted as compatible.",
  };
}
