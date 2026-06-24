/**
 * Demo copilot data — read-only explain scaffold, not live agent output.
 */
import type {
  CopilotCitation,
  CopilotGroundingStatus,
  CopilotLimit,
  CopilotMessage,
  CopilotTool,
} from "./copilotRoomTypes";

export const COPILOT_LIMITS: CopilotLimit[] = [
  { id: "no-write", text: "No write access", allowed: false },
  { id: "no-control", text: "No live control", allowed: false },
  { id: "no-graph", text: "No graph edits", allowed: false },
  { id: "cite", text: "Cite-or-silent", allowed: true },
];

export const ALLOWED_TOOLS: CopilotTool[] = [
  { id: "read-model", name: "read_model", label: "read model", allowed: true, status: "available" },
  { id: "read-graph", name: "read_graph", label: "read graph", allowed: true, status: "available" },
  { id: "read-audit", name: "read_audit", label: "read audit", allowed: true, status: "available" },
  { id: "read-state", name: "read_state", label: "read state", allowed: true, status: "available" },
];

export const BLOCKED_TOOLS: CopilotTool[] = [
  { id: "write-plc", name: "write_plc", label: "write PLC", allowed: false, status: "blocked" },
  { id: "change-graph", name: "change_graph", label: "change graph", allowed: false, status: "blocked" },
  { id: "ack-user", name: "ack_for_user", label: "ack for user", allowed: false, status: "blocked" },
  { id: "deploy-hmi", name: "deploy_hmi", label: "deploy HMI", allowed: false, status: "blocked" },
];

export const DEMO_CITATIONS: CopilotCitation[] = [
  { id: "graph", source: "graph.json", label: "Approved causal DAG" },
  { id: "faults", source: "faults.json", label: "Fault mode catalog" },
  { id: "evidence", source: "evidence", label: "Situation evidence bundle" },
  { id: "audit", source: "audit log", label: "Read-only audit tail" },
];

export const QUICK_QUESTIONS = [
  "Explain grouping",
  "What changed?",
  "What is missing?",
  "What can I do?",
] as const;

export const SUGGESTED_PROMPTS = [
  "Explain root cause",
  "Show missing evidence",
  "Why not bearing wear?",
  "What should operator do?",
] as const;

export const INITIAL_DEMO_MESSAGES: CopilotMessage[] = [
  {
    id: "msg-user-1",
    role: "user",
    text: "Why did PlantLens group these 14 alarms?",
    timestamp: Date.now() - 120_000,
  },
  {
    id: "msg-copilot-1",
    role: "copilot",
    text: [
      "PlantLens grouped them because the approved DAG path matches:",
      "Load Rise → Current High → RPM Sag.",
      "",
      "It did NOT find a contradiction strong enough to veto overload.",
      "",
      "Next safe step: inspect load path and verify thermal sensor quality.",
    ].join("\n"),
    evidence: [
      { signal: "current", value: "14.2A rising", status: "bound" },
      { signal: "rpm", value: "1180 and falling", status: "bound" },
      { signal: "winding temp", value: "missing", status: "missing" },
    ],
    citations: ["graph.json", "faults.json", "evidence"],
    toolCalls: ["fetch_state", "read_graph", "explain_dag", "audit_tail"],
    timestamp: Date.now() - 115_000,
  },
];

export const LAST_TOOL_TRACE: CopilotTool[] = [
  { id: "fetch-state", name: "fetch_state", label: "fetch_state", allowed: true, status: "used" },
  { id: "read-graph-used", name: "read_graph", label: "read_graph", allowed: true, status: "used" },
  { id: "explain-dag", name: "explain_dag", label: "explain_dag", allowed: true, status: "used" },
  { id: "audit-tail", name: "audit_tail", label: "audit_tail", allowed: true, status: "used" },
];

function normalizePrompt(prompt: string): string {
  return prompt.trim().toLowerCase();
}

export function generateCopilotResponse(prompt: string): {
  message: CopilotMessage;
  toolTrace: CopilotTool[];
  grounding: CopilotGroundingStatus;
} {
  const q = normalizePrompt(prompt);
  const id = `msg-copilot-${Date.now()}`;

  if (q.includes("missing") || q.includes("what is missing")) {
    return {
      message: {
        id,
        role: "copilot",
        text: "Missing evidence: winding temperature channel is offline. Coverage gap on bearing temp reduces confidence but does not veto overload path.",
        evidence: [
          { signal: "winding temp", value: "missing", status: "missing" },
          { signal: "bearing temp", value: "coverage gap", status: "optional" },
        ],
        citations: ["evidence", "signals.json"],
        toolCalls: ["fetch_state", "read_evidence"],
        timestamp: Date.now(),
      },
      toolTrace: [
        { id: "fs", name: "fetch_state", label: "fetch_state", allowed: true, status: "used" },
        { id: "re", name: "read_evidence", label: "read_evidence", allowed: true, status: "used" },
      ],
      grounding: "grounded",
    };
  }

  if (q.includes("root cause") || q.includes("explain")) {
    return {
      message: {
        id,
        role: "copilot",
        text: "Root cause path: Load Rise → Current High → RPM Sag. Supporting signals align with motor overload suspected. No strong contradiction from vibration channel.",
        evidence: [
          { signal: "current", value: "14.2A rising", status: "bound" },
          { signal: "rpm", value: "1180 falling", status: "bound" },
          { signal: "vibration", value: "normal", status: "bound" },
        ],
        citations: ["graph.json", "faults.json", "evidence"],
        toolCalls: ["read_graph", "explain_dag"],
        timestamp: Date.now(),
      },
      toolTrace: LAST_TOOL_TRACE,
      grounding: "grounded",
    };
  }

  if (q.includes("bearing")) {
    return {
      message: {
        id,
        role: "copilot",
        text: "Bearing wear is not the primary hypothesis: vibration remains normal and the approved DAG favors electrical overload over mechanical wear. Cite-or-silent — insufficient bearing evidence to promote that path.",
        citations: ["graph.json", "faults.json"],
        toolCalls: ["read_graph", "explain_dag"],
        timestamp: Date.now(),
      },
      toolTrace: LAST_TOOL_TRACE.slice(0, 3),
      grounding: "partial",
    };
  }

  if (q.includes("operator") || q.includes("what can") || q.includes("what should")) {
    return {
      message: {
        id,
        role: "copilot",
        text: "Operator-safe next steps: verify load path, inspect coupling, reduce motor load per action envelope. Copilot cannot ack or control — view evidence and follow approved envelope only.",
        citations: ["actions.json", "evidence"],
        toolCalls: ["read_actions", "read_evidence"],
        timestamp: Date.now(),
      },
      toolTrace: [
        { id: "ra", name: "read_actions", label: "read_actions", allowed: true, status: "used" },
        { id: "re2", name: "read_evidence", label: "read_evidence", allowed: true, status: "used" },
      ],
      grounding: "grounded",
    };
  }

  return {
    message: {
      id,
      role: "copilot",
      text: "I can only answer from read-only model, state, evidence, and audit sources. Ask about grouping, missing evidence, root cause, or operator-safe next steps.",
      citations: ["audit log"],
      toolCalls: ["fetch_state"],
      timestamp: Date.now(),
    },
    toolTrace: [
      { id: "fs2", name: "fetch_state", label: "fetch_state", allowed: true, status: "used" },
    ],
    grounding: "partial",
  };
}

export function getActiveScreenLabel(screen: string): string {
  switch (screen) {
    case "evidence":
      return "Evidence Room";
    case "dag":
      return "Engineer DAG View";
    case "map":
      return "Operational Map";
    case "assetStudio":
      return "Asset Studio";
    case "plantLayoutStudio":
      return "Plant Layout Studio";
    case "hmiPreview":
      return "HMI Preview";
    case "copilotRoom":
      return "Copilot Explain Room";
    default:
      return "Operational Map";
  }
}