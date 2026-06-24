/**
 * Demo evidence room data — scaffold fallback for Screen 02.
 * Marked as demo fallback in UI; replaced by live evidence API when wired.
 */
import type { EvidenceRoomData } from "../types/evidence";

export const DEMO_EVIDENCE: Record<string, EvidenceRoomData> = {
  "sit-motor-overload": {
    situationId: "sit-motor-overload",
    isDemoFallback: true,
    rootCause: "M-101 overload likely before thermal trip.",
    consequence: "Load rise is causing current high and RPM sag without thermal confirmation.",
    collapseSummary: "14 raw alarms → 1 situation",
    evidence: [
      {
        id: "ev-current",
        kind: "supporting",
        signal: "Current",
        expected: "HIGH",
        observed: "14.2A ↑",
        match: "match",
        weight: 1.5,
        quality: "good",
        note: "Rising trend over 3 samples",
      },
      {
        id: "ev-rpm",
        kind: "supporting",
        signal: "RPM",
        expected: "FALLING",
        observed: "1180 ↓",
        match: "match",
        weight: 1.0,
        quality: "good",
        note: "Correlates with current rise",
      },
      {
        id: "ev-temp",
        kind: "missing",
        signal: "Temp",
        expected: "RISING",
        observed: "missing",
        match: "unknown",
        weight: null,
        quality: "unknown",
        note: "Sensor path offline",
      },
      {
        id: "ev-vibration",
        kind: "neutral",
        signal: "Vibration",
        expected: "NORMAL",
        observed: "normal",
        match: "match",
        weight: 0,
        quality: "good",
        note: "Does not veto overload",
      },
    ],
    contradictions: [],
    missingItems: [
      {
        id: "miss-temp",
        signal: "Winding temperature",
        why: "Quality = UNKNOWN — cannot confirm thermal trajectory.",
        recommendation: "Verify thermal sensor path and I/O module health.",
      },
    ],
    causalPath: [
      { id: "cp-1", label: "Load rise", status: "confirmed", timestamp: "10:42" },
      { id: "cp-2", label: "Current high", status: "confirmed", timestamp: "10:42" },
      { id: "cp-3", label: "RPM sag", status: "inferred", timestamp: "10:43" },
      { id: "cp-4", label: "Alarm flood collapsed", status: "confirmed", timestamp: "10:44" },
    ],
    actionEnvelope: {
      state: "degraded",
      reason: "Load reduction is safe but temp evidence is incomplete.",
      allowed: ["View evidence", "Ask copilot", "Hold Ack"],
      blocked: ["Start motor", "Stop motor", "Trip relay", "Plant control"],
    },
    timeline: [
      { id: "tl-1", time: "10:42", label: "Current rising" },
      { id: "tl-2", time: "10:43", label: "RPM falling" },
      { id: "tl-3", time: "10:44", label: "Grouped into situation" },
      { id: "tl-4", time: "10:45", label: "Awaiting acknowledgement" },
    ],
  },
  "sit-sensor-gap": {
    situationId: "sit-sensor-gap",
    isDemoFallback: true,
    rootCause: "Temperature evidence gap weakens overload confidence.",
    consequence: "Diagnosis cannot confirm thermal protection path.",
    collapseSummary: "6 raw alarms → 1 situation",
    evidence: [
      {
        id: "ev-temp-gap",
        kind: "missing",
        signal: "Temp",
        expected: "PRESENT",
        observed: "missing",
        match: "gap",
        weight: null,
        quality: "unknown",
        note: "Primary gap signal",
      },
      {
        id: "ev-current-2",
        kind: "supporting",
        signal: "Current",
        expected: "HIGH",
        observed: "13.8A ↑",
        match: "partial",
        weight: 0.6,
        quality: "uncertain",
        note: "Supporting but insufficient alone",
      },
    ],
    contradictions: [
      {
        id: "con-ambient",
        signal: "Ambient humidity",
        note: "Spurious correlation — does not veto grouping.",
        vetoes: false,
      },
    ],
    missingItems: [
      {
        id: "miss-bearing",
        signal: "Bearing temperature",
        why: "Coverage gap on bearing temp channel.",
        recommendation: "Restore bearing temp sensor and validate quality flag.",
      },
      {
        id: "miss-winding",
        signal: "Winding temperature",
        why: "Offline sensor blocks thermal confirmation.",
        recommendation: "Inspect sensor wiring and module diagnostics.",
      },
    ],
    causalPath: [
      { id: "cp-s1", label: "Sensor offline", status: "confirmed" },
      { id: "cp-s2", label: "Coverage gap", status: "confirmed" },
      { id: "cp-s3", label: "Confidence reduced", status: "inferred" },
      { id: "cp-s4", label: "Situation flagged UNKNOWN", status: "confirmed" },
    ],
    actionEnvelope: {
      state: "unknown",
      reason: "Insufficient evidence to recommend load changes.",
      allowed: ["View evidence", "Ask copilot", "Inspect sensor path"],
      blocked: ["Start motor", "Stop motor", "Plant control"],
    },
    timeline: [
      { id: "tl-s1", time: "10:38", label: "Temp quality uncertain" },
      { id: "tl-s2", time: "10:40", label: "Coverage gap detected" },
      { id: "tl-s3", time: "10:41", label: "Grouped as sensor gap" },
      { id: "tl-s4", time: "10:45", label: "Awaiting acknowledgement" },
    ],
  },
};

export function getEvidenceRoomData(situationId: string): EvidenceRoomData | undefined {
  return DEMO_EVIDENCE[situationId];
}

export function resolveEvidenceRoomData(
  situationId: string | null,
  fallbackId: string,
): EvidenceRoomData {
  const id = situationId ?? fallbackId;
  return (
    getEvidenceRoomData(id) ??
    getEvidenceRoomData(fallbackId) ?? {
      situationId: fallbackId,
      isDemoFallback: true,
      rootCause: "Evidence data pending.",
      consequence: "Live evidence API not yet connected.",
      collapseSummary: "—",
      evidence: [],
      contradictions: [],
      missingItems: [],
      causalPath: [],
      actionEnvelope: {
        state: "unknown",
        reason: "No evidence envelope available.",
        allowed: ["Ask copilot"],
        blocked: ["Plant control"],
      },
      timeline: [],
    }
  );
}