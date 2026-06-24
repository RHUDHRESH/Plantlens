/**
 * Copilot Explain Room types — read-only agent surface (Screen 07).
 * No plant write path. All answers must cite sources or stay silent.
 */

export type CopilotMessageRole = "user" | "copilot";

export type CopilotGroundingStatus = "grounded" | "partial" | "unknown";

export type CopilotToolStatus = "used" | "blocked" | "available";

export interface CopilotEvidenceItem {
  signal: string;
  value: string;
  status: "bound" | "missing" | "optional";
}

export interface CopilotMessage {
  id: string;
  role: CopilotMessageRole;
  text: string;
  evidence?: CopilotEvidenceItem[];
  citations?: string[];
  toolCalls?: string[];
  timestamp: number;
}

export interface CopilotTool {
  id: string;
  name: string;
  label: string;
  allowed: boolean;
  status: CopilotToolStatus;
}

export interface CopilotCitation {
  id: string;
  source: string;
  label: string;
}

export interface CopilotLimit {
  id: string;
  text: string;
  allowed: boolean;
}