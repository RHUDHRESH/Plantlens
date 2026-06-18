import type { SourceQuality } from "../contracts/canonical.js";
import { normalizeText } from "./normalizeText.js";

export function normalizeSourceQuality(value: unknown): SourceQuality {
  if (typeof value === "number" && Number.isFinite(value)) {
    const severityBits = (value >>> 30) & 0b11;
    if (severityBits === 0) {
      return "GOOD";
    }
    return severityBits === 1 ? "UNCERTAIN" : "BAD";
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return normalizeSourceQuality(
      record.name ?? record.symbol ?? record.value ?? record.code
    );
  }
  const text = normalizeText(value)?.toUpperCase();
  if (!text) {
    return "UNKNOWN";
  }
  if (
    text === "0" ||
    text === "GOOD" ||
    text.startsWith("GOOD_") ||
    text.startsWith("0X0")
  ) {
    return "GOOD";
  }
  if (/^\d+$/.test(text)) {
    return normalizeSourceQuality(Number.parseInt(text, 10));
  }
  if (/^0X[0-9A-F]+$/.test(text)) {
    return normalizeSourceQuality(Number.parseInt(text.slice(2), 16));
  }
  if (text.includes("UNCERTAIN")) {
    return "UNCERTAIN";
  }
  if (
    text.includes("BAD") ||
    text.includes("ERROR") ||
    text.includes("NO_COMMUNICATION")
  ) {
    return "BAD";
  }
  return "UNKNOWN";
}
