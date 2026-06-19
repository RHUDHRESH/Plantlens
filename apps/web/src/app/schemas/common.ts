/** Shared contract enums mirrored from packages/contracts. */

export type TagQuality = "GOOD" | "UNCERTAIN" | "BAD" | "STALE" | "MISSING";
export type TagSource = "simulator" | "modbus_rtu" | "modbus_tcp" | "manual" | "backfill";

export type Severity = "info" | "warning" | "critical";
export type Confidence = "low" | "medium" | "high";
export type RiskLevel = "low" | "medium" | "high" | "unknown";

export type EvidenceRole = "first_signal" | "evidence" | "consequence";
export type AlarmOp = "<" | "<=" | ">" | ">=" | "==" | "!=" | "bool_true" | "bool_false";

export type ActorType = "user" | "agent" | "system";
export type ActorRole = "operator" | "engineer" | "maintenance" | "supervisor" | "admin" | "agent";

export type TimeToConsequenceState = "counting" | "stable" | "unknown";

export type TagValue = number | string | boolean | null;