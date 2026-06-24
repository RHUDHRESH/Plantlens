/**
 * Evidence Room types — frontend view models for Screen 02.
 */

export type EvidenceKind = "supporting" | "contradicting" | "missing" | "neutral";

export interface EvidenceItem {
  id: string;
  kind: EvidenceKind;
  signal: string;
  expected: string;
  observed: string;
  match: string;
  weight: number | null;
  quality: "good" | "uncertain" | "bad" | "unknown";
  note: string;
}

export interface CausalPathStep {
  id: string;
  label: string;
  status: "confirmed" | "inferred" | "missing";
  timestamp?: string;
}

export type ActionEnvelopeState =
  | "available"
  | "blocked"
  | "degraded"
  | "unsafe"
  | "unknown";

export interface ActionEnvelopeView {
  state: ActionEnvelopeState;
  reason: string;
  allowed: string[];
  blocked: string[];
}

export interface ContradictionItem {
  id: string;
  signal: string;
  note: string;
  vetoes: boolean;
}

export interface MissingEvidenceItem {
  id: string;
  signal: string;
  why: string;
  recommendation: string;
}

export interface TimelineEvent {
  id: string;
  time: string;
  label: string;
}

export interface EvidenceRoomData {
  situationId: string;
  isDemoFallback: boolean;
  rootCause: string;
  consequence: string;
  collapseSummary: string;
  evidence: EvidenceItem[];
  contradictions: ContradictionItem[];
  missingItems: MissingEvidenceItem[];
  causalPath: CausalPathStep[];
  actionEnvelope: ActionEnvelopeView;
  timeline: TimelineEvent[];
}