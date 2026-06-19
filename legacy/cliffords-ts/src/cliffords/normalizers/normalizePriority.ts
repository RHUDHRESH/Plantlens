import type { OpcUaSeverityRange } from "../contracts/plantModel.js";
import { normalizeText } from "./normalizeText.js";

const PRIORITY_ALIASES = new Map<string, 1 | 2 | 3 | 4>([
  ["critical", 1],
  ["emergency", 1],
  ["p1", 1],
  ["1", 1],
  ["high", 2],
  ["major", 2],
  ["p2", 2],
  ["2", 2],
  ["medium", 3],
  ["warning", 3],
  ["p3", 3],
  ["3", 3],
  ["low", 4],
  ["info", 4],
  ["advisory", 4],
  ["p4", 4],
  ["4", 4]
]);

export function normalizePriority(value: unknown): 1 | 2 | 3 | 4 | null {
  if (typeof value === "number" && [1, 2, 3, 4].includes(value)) {
    return value as 1 | 2 | 3 | 4;
  }
  const text = normalizeText(value);
  return text ? (PRIORITY_ALIASES.get(text.toLowerCase()) ?? null) : null;
}

export function mapOpcUaSeverity(
  value: unknown,
  ranges: OpcUaSeverityRange[]
): 1 | 2 | 3 | 4 | null {
  const severity =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(severity)) {
    return null;
  }
  return (
    ranges.find(
      (range) => severity >= range.min && severity <= range.max
    )?.priority ?? null
  );
}
