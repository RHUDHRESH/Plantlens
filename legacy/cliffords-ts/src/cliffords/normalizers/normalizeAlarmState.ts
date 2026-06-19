import type { CanonicalAlarmState } from "../contracts/canonical.js";
import { normalizeText } from "./normalizeText.js";

const STATE_ALIASES = new Map<string, CanonicalAlarmState>([
  ["active", "ACTIVE"],
  ["act", "ACTIVE"],
  ["on", "ACTIVE"],
  ["raised", "ACTIVE"],
  ["triggered", "ACTIVE"],
  ["true", "ACTIVE"],
  ["1", "ACTIVE"],
  ["clear", "CLEAR"],
  ["cleared", "CLEAR"],
  ["off", "CLEAR"],
  ["return_to_normal", "CLEAR"],
  ["rtn", "CLEAR"],
  ["false", "CLEAR"],
  ["0", "CLEAR"],
  ["ack", "ACKED"],
  ["acked", "ACKED"],
  ["acknowledged", "ACKED"],
  ["shelved", "SHELVED"],
  ["suppressed", "SUPPRESSED"]
]);

export function normalizeAlarmState(
  value: unknown
): CanonicalAlarmState | null {
  if (typeof value === "boolean") {
    return value ? "ACTIVE" : "CLEAR";
  }
  const text = normalizeText(value);
  if (!text) {
    return null;
  }
  return (
    STATE_ALIASES.get(text.toLowerCase().replace(/\s+/g, "_")) ?? null
  );
}
