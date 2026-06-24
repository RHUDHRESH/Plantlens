/**
 * DAG view types — Screen 03 engineer causal graph (read-only live view).
 */
import type { Edge, Node } from "@xyflow/react";

export type DagNodeKind = "fault" | "signal" | "alarm" | "action" | "missing" | "root";
export type DagNodeStatus =
  | "root"
  | "supporting"
  | "missing"
  | "contradicting"
  | "projected"
  | "neutral";
export type DagEdgeKind = "causal" | "temporal" | "projected" | "contradiction";
export type DagHighlightMode = "path" | "contradictions" | "missing" | "all";
export type DagLayerName = "faults" | "signals" | "alarms" | "actions" | "hiddenNormal";

export interface DagLayerVisibility {
  faults: boolean;
  signals: boolean;
  alarms: boolean;
  actions: boolean;
  hiddenNormal: boolean;
}

export interface DagNodeData {
  label: string;
  kind: DagNodeKind;
  status: DagNodeStatus;
  confidence?: number;
  coverage?: number;
  timestamp?: string;
  evidence?: string[];
  note?: string;
  highlighted?: boolean;
  dimmed?: boolean;
  [key: string]: unknown;
}

export interface DagEdgeData {
  label: string;
  kind: DagEdgeKind;
  expectedWindow: string;
  observedDelay?: string;
  confidence?: number;
  approved: boolean;
  sourceRef?: string;
  evidence?: string[];
  highlighted?: boolean;
  dimmed?: boolean;
  [key: string]: unknown;
}

export interface DagPathStep {
  id: string;
  label: string;
  kind: DagNodeKind;
  status: DagNodeStatus;
  expectedWindow?: string;
  observedDelay?: string;
}

export type DagFlowNode = Node<DagNodeData, "dagNode">;
export type DagFlowEdge = Edge<DagEdgeData, "dagEdge">;

export interface DagGraphMeta {
  situationId: string;
  isDemoFallback: boolean;
  timelineFit: string;
  collapseSummary: string;
  topologicalOrder: string;
  traversalNote: string;
  pathNodeIds: string[];
  mobilePath: DagPathStep[];
  mobileMissing: { label: string; note: string };
  mobileActionGuidance: string;
}