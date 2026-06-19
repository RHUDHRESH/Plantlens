/** Frontend contract mirrors — types aligned with packages/contracts (canonical JSON Schema). */

export type {
  ActorRole,
  ActorType,
  AlarmOp,
  Confidence,
  EvidenceRole,
  RiskLevel,
  Severity,
  TagQuality,
  TagSource,
  TagValue,
  TimeToConsequenceState,
} from "./common";

export type { AlarmCondition, AlarmRule, AlarmRules } from "./alarm";
export type { AuditRecord } from "./audit";
export type {
  CalmCard,
  CalmCardBlockedAction,
  CalmCardEvidenceItem,
  CalmCardFirstSignal,
  CalmCardRecommendedCheck,
  CalmCardTimeToConsequence,
} from "./calmCard";
export type { Situation, SituationEvidence } from "./situation";
export type { TagFrame } from "./tagFrame";
export { tagFrameIdentityKey } from "./tagFrame";