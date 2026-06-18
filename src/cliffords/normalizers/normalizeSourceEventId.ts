import { normalizeText } from "./normalizeText.js";

export function normalizeSourceEventId(value: unknown): string | null {
  if (value instanceof Uint8Array) {
    return `base64:${Buffer.from(value).toString("base64")}`;
  }
  if (Array.isArray(value) && value.every((entry) => Number.isInteger(entry))) {
    return `base64:${Buffer.from(value as number[]).toString("base64")}`;
  }
  if (
    value &&
    typeof value === "object" &&
    "data" in value &&
    Array.isArray((value as { data: unknown }).data)
  ) {
    const data = (value as { data: unknown[] }).data;
    if (data.every((entry) => Number.isInteger(entry))) {
      return `base64:${Buffer.from(data as number[]).toString("base64")}`;
    }
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return normalizeText(value);
}
