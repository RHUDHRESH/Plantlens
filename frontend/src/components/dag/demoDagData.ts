/**
 * Demo DAG data — deterministic Motor Overload graph (scaffold fallback).
 */
import type {
  DagFlowEdge,
  DagFlowNode,
  DagGraphMeta,
  DagLayerVisibility,
  DagNodeData,
  DagPathStep,
} from "./dagTypes";

export const MOTOR_OVERLOAD_PATH_IDS = [
  "load_rise",
  "current_high",
  "rpm_sag",
  "alarm_flood",
] as const;

export const DEMO_DAG_NODES: DagFlowNode[] = [
  {
    id: "load_rise",
    type: "dagNode",
    position: { x: 280, y: 0 },
    data: {
      label: "Load Rise",
      kind: "root",
      status: "root",
      confidence: 0.91,
      timestamp: "10:42",
      note: "Primary causal root",
    },
  },
  {
    id: "current_high",
    type: "dagNode",
    position: { x: 280, y: 110 },
    data: {
      label: "Current High",
      kind: "signal",
      status: "supporting",
      confidence: 0.88,
      timestamp: "10:42",
      evidence: ["current = 14.2A rising"],
    },
  },
  {
    id: "rpm_sag",
    type: "dagNode",
    position: { x: 120, y: 230 },
    data: {
      label: "RPM Sag",
      kind: "signal",
      status: "supporting",
      confidence: 0.85,
      timestamp: "10:43",
      evidence: ["rpm = 1180 falling"],
    },
  },
  {
    id: "temp_missing",
    type: "dagNode",
    position: { x: 20, y: 230 },
    data: {
      label: "Winding Temp Unknown",
      kind: "missing",
      status: "missing",
      evidence: ["quality = unknown"],
      note: "Does not veto diagnosis",
    },
  },
  {
    id: "thermal_risk",
    type: "dagNode",
    position: { x: 440, y: 230 },
    data: {
      label: "Thermal Risk",
      kind: "fault",
      status: "projected",
      confidence: 0.62,
      note: "Projected from current trend",
    },
  },
  {
    id: "alarm_flood",
    type: "dagNode",
    position: { x: 120, y: 360 },
    data: {
      label: "Alarm Flood Collapsed",
      kind: "alarm",
      status: "supporting",
      confidence: 0.9,
      timestamp: "10:44",
      evidence: ["14 raw alarms → 1 situation"],
    },
  },
  {
    id: "reduce_load",
    type: "dagNode",
    position: { x: 440, y: 360 },
    data: {
      label: "Reduce Load Recommendation",
      kind: "action",
      status: "projected",
      note: "Action guidance — read-only",
    },
  },
];

export const DEMO_DAG_EDGES: DagFlowEdge[] = [
  {
    id: "e-load-current",
    source: "load_rise",
    target: "current_high",
    type: "dagEdge",
    data: {
      label: "causal",
      kind: "causal",
      expectedWindow: "0-30s",
      observedDelay: "12s",
      confidence: 0.91,
      approved: true,
      sourceRef: "dag/motor_overload_v1",
      evidence: ["+ current rising"],
    },
  },
  {
    id: "e-current-rpm",
    source: "current_high",
    target: "rpm_sag",
    type: "dagEdge",
    data: {
      label: "causal",
      kind: "causal",
      expectedWindow: "0-20s",
      observedDelay: "18s",
      confidence: 0.87,
      approved: true,
      evidence: ["+ rpm falling"],
    },
  },
  {
    id: "e-current-thermal",
    source: "current_high",
    target: "thermal_risk",
    type: "dagEdge",
    data: {
      label: "projected",
      kind: "projected",
      expectedWindow: "30-300s",
      observedDelay: "projected",
      confidence: 0.62,
      approved: true,
    },
  },
  {
    id: "e-rpm-alarm",
    source: "rpm_sag",
    target: "alarm_flood",
    type: "dagEdge",
    data: {
      label: "causal",
      kind: "causal",
      expectedWindow: "0-10s",
      observedDelay: "4s",
      confidence: 0.9,
      approved: true,
    },
  },
  {
    id: "e-thermal-action",
    source: "thermal_risk",
    target: "reduce_load",
    type: "dagEdge",
    data: {
      label: "guidance",
      kind: "projected",
      expectedWindow: "action guidance",
      observedDelay: "projected",
      approved: true,
    },
  },
  {
    id: "e-temp-thermal",
    source: "temp_missing",
    target: "thermal_risk",
    type: "dagEdge",
    data: {
      label: "missing-support",
      kind: "temporal",
      expectedWindow: "needed for confirmation",
      observedDelay: "missing",
      confidence: 0.4,
      approved: true,
      evidence: ["? temp missing"],
    },
  },
];

const MOBILE_PATH: DagPathStep[] = [
  {
    id: "load_rise",
    label: "Load Rise",
    kind: "root",
    status: "root",
    expectedWindow: "0-30s",
  },
  {
    id: "current_high",
    label: "Current High",
    kind: "signal",
    status: "supporting",
    expectedWindow: "0-20s",
    observedDelay: "observed at +12s",
  },
  {
    id: "rpm_sag",
    label: "RPM Sag",
    kind: "signal",
    status: "supporting",
    observedDelay: "observed at +18s",
  },
  {
    id: "alarm_flood",
    label: "Alarm flood collapsed",
    kind: "alarm",
    status: "supporting",
    observedDelay: "14 raw alarms → 1 card",
  },
];

export const DEMO_DAG_META: DagGraphMeta = {
  situationId: "sit-motor-overload",
  isDemoFallback: true,
  timelineFit: "GOOD",
  collapseSummary: "14 → 1",
  topologicalOrder: "Load → Current → RPM → Alarm",
  traversalNote: "Deterministic, approved graph",
  pathNodeIds: [...MOTOR_OVERLOAD_PATH_IDS],
  mobilePath: MOBILE_PATH,
  mobileMissing: {
    label: "Winding temp unknown",
    note: "does not veto diagnosis",
  },
  mobileActionGuidance: "Reduce load recommendation — read-only guidance",
};

export function getDemoDagForSituation(situationId: string): {
  nodes: DagFlowNode[];
  edges: DagFlowEdge[];
  meta: DagGraphMeta;
} {
  if (situationId === "sit-motor-overload") {
    return {
      nodes: DEMO_DAG_NODES,
      edges: DEMO_DAG_EDGES,
      meta: DEMO_DAG_META,
    };
  }
  return {
    nodes: DEMO_DAG_NODES.slice(0, 4),
    edges: DEMO_DAG_EDGES.slice(0, 3),
    meta: {
      ...DEMO_DAG_META,
      situationId,
      isDemoFallback: true,
      collapseSummary: "6 → 1",
      topologicalOrder: "Sensor gap → Coverage reduced",
      pathNodeIds: ["load_rise", "current_high", "temp_missing"],
      mobilePath: MOBILE_PATH.slice(0, 3),
    },
  };
}

export function nodeKindToLayer(kind: DagNodeData["kind"]): keyof DagLayerVisibility {
  if (kind === "fault") return "faults";
  if (kind === "alarm") return "alarms";
  if (kind === "action") return "actions";
  return "signals";
}